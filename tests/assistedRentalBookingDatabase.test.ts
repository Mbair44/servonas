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
  await db.exec(`alter table bookings add column deposit_cents integer;alter table bookings add column payment_request_expires_at timestamptz;
   create function record_staff_booking_sms_consent(uuid,boolean,text,text) returns void language plpgsql as $$begin if $3='fail' then raise exception 'consent failure';end if;end;$$;`);
  await db.exec(await read('../supabase/migrations/20260929000100_assisted_multi_item_booking.sql'));
  const biz='00000000-0000-4000-8000-000000000001',a='00000000-0000-4000-8000-000000000003',b='00000000-0000-4000-8000-000000000004';
  await db.exec(`insert into businesses values('${biz}');insert into booking_settings(business_id) values('${biz}');insert into inventory_items(id,business_id,name,daily_price_cents,stock_quantity) values('${a}','${biz}','Monsoon',22500,1),('${b}','${biz}','Castle',18500,1);insert into rental_listing_inventory_requirements values('${a}','${a}',1),('${b}','${b}',1);`);
  const lines=[{inventoryItemId:a,quantity:1,unitPriceCents:22500},{inventoryItemId:b,quantity:1,unitPriceCents:18500}];
  const details={rentalDate:'2026-11-05',firstName:'Test',lastName:'Customer',email:'test@example.com',phone:'555',address:'123 Main',city:'Mesa',zip:'85201',discount:5000,delivery:5000,tax:0,deposit:20500};
  let counter=10;
  const create=async(selected=lines,overrides={},key=`00000000-0000-4000-8000-${String(counter++).padStart(12,'0')}`)=>db.query('select * from create_assisted_rental_booking($1,$2,$3::jsonb,$4::jsonb)',[biz,key,JSON.stringify(selected),JSON.stringify({...details,...overrides})]);
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
   await assert.rejects(create([lines[0]],{rentalDate:'2026-11-20',deposit:10000,smsConsent:true,smsDisclosure:'fail'}),/consent failure/);
   assert.equal((await db.query('select * from bookings')).rows.length,before);
  });
  await t.test('cross-tenant item rejected before reservation and RPC is service-role only',async()=>{
   const other='00000000-0000-4000-8000-000000000088';await db.exec(`insert into businesses values('${other}');update inventory_items set business_id='${other}' where id='${b}'`);
   await assert.rejects(create(),/no longer available/);
   const result=(await db.query(`select has_function_privilege('authenticated','create_assisted_rental_booking(uuid,uuid,jsonb,jsonb)','execute') as allowed`)).rows[0];assert.equal(result.allowed,false);
  });
 }finally{await db.close();}
});
