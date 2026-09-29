import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=process.env.PGLITE_TEST_ROOT;
test('assisted bookings reuse canonical atomic multi-item reservations',{skip:!root},async t=>{
 const {PGlite}=await import(`${root}/dist/index.js`),{btree_gist}=await import(`${root}/dist/contrib/btree_gist.js`);
 const db=new PGlite({extensions:{btree_gist}});
 const read=(file:string)=>readFile(new URL(file,import.meta.url),'utf8');
 try{
  await db.exec(await read('./fixtures/rentalDatePricing.sql'));
  const original=await read('../supabase/migrations/20260911000200_shared_rental_inventory.sql');
  await db.exec(original.slice(original.indexOf('create or replace function public.create_public_booking_quantities_timed('),original.indexOf('create or replace function public.rental_inventory_performance(')));
  await db.exec(await read('../supabase/migrations/20260921000100_add_rental_items_to_existing_booking.sql'));
  await db.exec(await read('../supabase/migrations/20260928000200_rental_date_pricing.sql'));
  await db.exec(`alter table bookings add column deposit_cents integer;alter table bookings add column payment_request_expires_at timestamptz;`);
  await db.exec(await read('./fixtures/staffBookingSmsConsent.sql'));
  await db.exec(await read('../supabase/migrations/20260929000100_assisted_multi_item_booking.sql'));
  const biz='00000000-0000-4000-8000-000000000001',a='00000000-0000-4000-8000-000000000003',b='00000000-0000-4000-8000-000000000004';
  await db.exec(`insert into businesses values('${biz}');insert into booking_settings(business_id) values('${biz}');insert into inventory_items(id,business_id,name,daily_price_cents,stock_quantity) values('${a}','${biz}','Monsoon',22500,1),('${b}','${biz}','Castle',18500,1);insert into rental_listing_inventory_requirements values('${a}','${a}',1),('${b}','${b}',1);`);
  const lines=[{inventoryItemId:a,quantity:1,unitPriceCents:22500},{inventoryItemId:b,quantity:1,unitPriceCents:18500}];
  const details={rentalDate:'2026-11-05',firstName:'Test',lastName:'Customer',email:'test@example.com',phone:'555',address:'123 Main',city:'Mesa',zip:'85201',discount:5000,delivery:5000,tax:0,deposit:20500};
  let counter=10;
  const create=async(selected=lines,overrides={},key=`00000000-0000-4000-8000-${String(counter++).padStart(12,'0')}`)=>db.query('select * from create_assisted_rental_booking($1,$2,$3::jsonb,$4::jsonb)',[biz,key,JSON.stringify(selected),JSON.stringify({...details,...overrides})]);
  const repair=await read('../supabase/migrations/20260929000200_repair_staff_booking_sms_consent.sql');
  await t.test('missing real consent function reproduces production failure and rolls back booking',async()=>{
   assert.equal((await db.query("select to_regprocedure('public.record_staff_booking_sms_consent(uuid,boolean,text,text)') as signature")).rows[0].signature,null);
   await assert.rejects(create(lines,{smsConsent:true,smsDisclosure:'Consent disclosure',smsDisclosureVersion:'2026-09-25'}),/record_staff_booking_sms_consent.*does not exist/);
   assert.equal((await db.query('select count(*)::int as count from bookings')).rows[0].count,0);
   assert.equal((await db.query('select count(*)::int as count from booking_inventory_reservations')).rows[0].count,0);
  });
  await db.exec(repair);
  await t.test('repair installs real SECURITY DEFINER signature and service-only execution',async()=>{
   const row=(await db.query(`select p.prosecdef,p.proargnames,p.proconfig,
    pg_get_function_result(p.oid) as result,
    has_function_privilege('service_role',p.oid,'execute') as service_execute,
    has_function_privilege('anon',p.oid,'execute') as anon_execute,
    has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee=0 and acl.privilege_type='EXECUTE') as public_execute
    from pg_proc p where p.oid=to_regprocedure('public.record_staff_booking_sms_consent(uuid,boolean,text,text)')`)).rows[0];
   assert.ok(row);assert.equal(row.prosecdef,true);assert.equal(row.result,'void');assert.deepEqual(row.proargnames,['p_booking_id','p_granted','p_disclosure','p_disclosure_version']);assert.deepEqual(row.proconfig,['search_path=public']);
   assert.equal(row.service_execute,true);assert.equal(row.public_execute,false);assert.equal(row.anon_execute,false);assert.equal(row.authenticated_execute,false);
  });
  let bookingId:string;
  await t.test('two lines reserve both resources and save names, prices, totals and original date snapshots',async()=>{
   bookingId=(await create()).rows[0].booking_id;
   const booking=(await db.query('select * from bookings where id=$1',[bookingId])).rows[0];
   assert.equal(booking.total_cents,41000);assert.equal(booking.deposit_cents,20500);assert.equal(booking.balance_due_cents,20500);assert.equal(booking.delivery_fee_cents,5000);
   assert.match(booking.notes,/Monsoon × 1/);assert.match(booking.notes,/Castle × 1/);
   const saved=(await db.query('select * from booking_items where booking_id=$1 order by unit_price_cents desc',[bookingId])).rows;
   assert.equal(saved.length,2);assert.deepEqual(saved.map((row:any)=>row.item_name_snapshot),['Monsoon','Castle']);assert.deepEqual(saved.map((row:any)=>row.assisted_pricing_snapshot.lineSubtotalCents),[22500,18500]);assert.ok(saved.every((row:any)=>row.date_pricing_snapshot));
   assert.equal((await db.query('select * from booking_inventory_reservations where booking_id=$1',[bookingId])).rows.length,2);
  });
  await t.test('one unavailable item rolls back every item and booking',async()=>{
   await db.exec(`update inventory_items set stock_quantity=2 where id='${a}'`);
   await assert.rejects(create(),/Castle.*reserved/);
   assert.equal((await db.query('select * from bookings')).rows.length,1);
   assert.equal((await db.query('select * from booking_inventory_reservations')).rows.length,2);
  });
  await t.test('single item, quantity, tax, and explicit override work without changing historical snapshots',async()=>{
   await db.exec(`update inventory_items set stock_quantity=3 where id='${a}'`);
   const id=(await create([{...lines[0],quantity:2}],{rentalDate:'2026-11-09',subtotalOverride:44000,discount:1000,delivery:5000,tax:2500,deposit:25250})).rows[0].booking_id;
   const booking=(await db.query('select * from bookings where id=$1',[id])).rows[0];assert.equal(booking.total_cents,50500);assert.equal(booking.assisted_pricing_snapshot.itemSubtotalCents,45000);
   assert.equal((await db.query('select quantity from booking_items where booking_id=$1',[id])).rows[0].quantity,2);
   assert.equal((await db.query('select total_cents from bookings where id=$1',[bookingId])).rows[0].total_cents,41000);
  });
  await t.test('same request returns the original booking without duplicating inventory',async()=>{
   const key='00000000-0000-4000-8000-000000000099';const first=await create([lines[0]],{rentalDate:'2026-11-12',deposit:10000},key);const second=await create([lines[0]],{rentalDate:'2026-11-12',deposit:10000},key);assert.equal(first.rows[0].booking_id,second.rows[0].booking_id);await assert.rejects(create([lines[0]],{rentalDate:'2026-11-12',deposit:10001},key),/already created/);assert.equal((await db.query('select * from booking_items where booking_id=$1',[first.rows[0].booking_id])).rows.length,1);
  });
  await t.test('post-reservation consent error rolls back the reservation and pricing',async()=>{
   const before=(await db.query('select * from bookings')).rows.length;
   await assert.rejects(create([lines[0]],{rentalDate:'2026-11-20',deposit:10000,smsConsent:true,smsDisclosure:'Consent disclosure',smsDisclosureVersion:'2026-09-25'}),/valid mobile phone/);
   assert.equal((await db.query('select * from bookings')).rows.length,before);
  });
  await t.test('wrapper calls the real function and records staff evidence in all three tables',async()=>{
   await db.exec("update customers set phone_normalized='+16025550123' where email='test@example.com'");
   const id=(await create(lines,{rentalDate:'2026-11-23',smsConsent:true,smsDisclosure:'Consent disclosure',smsDisclosureVersion:'2026-09-25'})).rows[0].booking_id;
   const booking=(await db.query('select * from bookings where id=$1',[id])).rows[0];
   assert.equal(booking.sms_consent,true);assert.equal(booking.sms_consent_source,'staff_booking');assert.equal(booking.sms_consent_disclosure,'Consent disclosure');assert.equal(booking.sms_consent_disclosure_version,'2026-09-25');assert.ok(booking.sms_consent_recorded_at);
   const customer=(await db.query('select * from customers where id=$1',[booking.customer_id])).rows[0];assert.equal(customer.sms_consent_status,'express');
   const ledger=(await db.query('select * from customer_sms_consents where customer_id=$1',[booking.customer_id])).rows[0];assert.equal(ledger.status,'express');assert.equal(ledger.source,'staff_booking');assert.equal(ledger.evidence.booking_id,id);assert.equal(ledger.phone_e164,'+16025550123');
   // Re-running the forward repair must preserve existing evidence and financials.
   const before=(await db.query('select * from bookings order by id')).rows;
   await db.exec(repair);
   assert.deepEqual((await db.query('select * from bookings order by id')).rows,before);
   await db.query("update bookings set sms_consent_source='web_booking' where id=$1",[id]);
   await db.query("update bookings set sms_consent_source='staff_booking' where id=$1",[id]);
   await assert.rejects(db.query("update bookings set sms_consent_source='unknown' where id=$1",[id]),/bookings_sms_consent_evidence_check/);
   await assert.rejects(db.query("update bookings set sms_consent_disclosure=' ' where id=$1",[id]),/bookings_sms_consent_evidence_check/);
   await assert.rejects(db.query("update bookings set sms_consent_disclosure_version='' where id=$1",[id]),/bookings_sms_consent_evidence_check/);
  });
  await t.test('cross-tenant item rejected before reservation and RPC is service-role only',async()=>{
   const other='00000000-0000-4000-8000-000000000088';await db.exec(`insert into businesses values('${other}');update inventory_items set business_id='${other}' where id='${b}'`);
   await assert.rejects(create(),/no longer available/);
   const result=(await db.query(`select has_function_privilege('authenticated','create_assisted_rental_booking(uuid,uuid,jsonb,jsonb)','execute') as allowed`)).rows[0];assert.equal(result.allowed,false);
  });
 }finally{await db.close();}
});
