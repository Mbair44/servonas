import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=process.env.PGLITE_TEST_ROOT;
test('equipment allocation snapshots and tenant profitability in PostgreSQL',{skip:!root},async t=>{
 const {PGlite}=await import(`${root}/dist/index.js`);const db=new PGlite();
 const biz='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',a='00000000-0000-4000-8000-000000000003',b='00000000-0000-4000-8000-000000000004';
 try{
 await db.exec(await readFile(new URL('./fixtures/rentalDatePricing.sql',import.meta.url),'utf8'));
 await db.exec(`create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
 alter table inventory_items add column purchase_cost_cents integer;
 alter table bookings add column is_test_booking boolean default false,add column refunded_cents integer default 0,add column operator_total_cents integer default 0;
 alter table jobs add column status text default 'scheduled',add column is_deleted boolean default false;
 create table invoices(id uuid,business_id uuid,job_id uuid,is_deleted boolean default false,status text);
 create table invoice_line_items(invoice_id uuid,business_id uuid,internal_unit_cost_cents bigint,quantity numeric);
 insert into businesses values('${biz}'),('${other}');
 insert into inventory_items(id,business_id,name,daily_price_cents,stock_quantity,purchase_cost_cents) values('${a}','${biz}','Bounce',22500,1,300000),('${b}','${biz}','Obstacle',18500,2,900000);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260930000100_rental_equipment_profitability.sql',import.meta.url),'utf8'));
 await db.exec(`update inventory_items set profitability_tracking_enabled=true,expected_lifetime_rentals=100`);
 let serial=10;
 const create=async(options:{status?:string;paid?:number;test?:boolean;quantities?:number[]}={})=>{
  const id=`00000000-0000-4000-8000-${String(serial++).padStart(12,'0')}`;
  await db.query('insert into jobs(id,business_id) values($1,$2)',[id,biz]);
  await db.query("insert into bookings(id,business_id,job_id,status,amount_paid_cents,total_cents,tax_cents,delivery_fee_cents,is_test_booking) values($1,$2,$1,$3,$4,44000,3000,0,$5)",[id,biz,options.status??'confirmed',options.paid??22000,options.test??false]);
  for(const [idx,item] of [a,b].entries()){
   const qty=options.quantities?.[idx]??1;
   const line=(await db.query("insert into booking_items(booking_id,inventory_item_id,quantity,unit_price_cents,status) values($1,$2,$3,$4,'confirmed') returning id",[id,item,qty,idx===0?22500:18500])).rows[0].id;
   await db.query('insert into booking_inventory_reservations(business_id,booking_id,booking_item_id,listing_inventory_item_id,resource_inventory_item_id,quantity,revenue_allocation_weight) values($1,$2,$3,$4,$4,$5::integer,$5::integer::numeric)',[biz,id,line,item,qty]);
  }
  return id;
 };
 const complete=(id:string)=>db.query("update jobs set status='completed' where id=$1",[id]);
 const snapshot=async(id:string)=>(await db.query('select * from booking_profitability_snapshots where booking_id=$1',[id])).rows[0];
 const cost={labor:5000,delivery:2000,processingFees:1000,other:2000};
 let id:string;
 await t.test('multi-item allocation is $75 and cent-exact revenue shares reconcile',async()=>{
  id=await create();await complete(id);const s=await snapshot(id);assert.equal(s.equipment_allocation_cents,7500);assert.equal(s.revenue_cents,41000);assert.equal(s.contribution_profit_cents,null);
  const rows=(await db.query('select * from booking_equipment_allocations where booking_id=$1',[id])).rows;assert.equal(rows.length,2);assert.equal(rows.reduce((sum:number,row:any)=>sum+row.revenue_cents,0),41000);
 });
 await t.test('reviewed contribution and fully loaded profit preserve existing margin math',async()=>{
  await db.query('select finalize_booking_profitability($1,$2,$3::jsonb)',[biz,id,JSON.stringify(cost)]);
  assert.equal((await snapshot(id)).contribution_profit_cents,31000);
  const rows=(await db.query('select * from rental_inventory_profitability($1)',[biz])).rows;
  assert.equal(rows.reduce((sum:number,row:any)=>sum+row.contribution_cents,0),31000);assert.equal(rows.reduce((sum:number,row:any)=>sum+row.fully_loaded_cents,0),23500);
  await assert.rejects(db.query('select finalize_booking_profitability($1,$2,$3::jsonb)',[biz,id,JSON.stringify(cost)]),/already finalized/);
 });
 await t.test('later assumption changes cannot reprice a completed snapshot',async()=>{
  await db.exec(`update inventory_items set expected_lifetime_rentals=150 where id='${a}'`);
  await db.query('update bookings set amount_paid_cents=44000 where id=$1',[id]);assert.equal((await snapshot(id)).equipment_allocation_cents,7500);
  const future=await create();await complete(future);assert.equal((await snapshot(future)).equipment_allocation_cents,6500);
 });
 await t.test('quantity consumes physical units; canceled, unpaid and test bookings are excluded',async()=>{
  const quantity=await create({quantities:[1,2]});await complete(quantity);assert.equal((await snapshot(quantity)).equipment_allocation_cents,11000);
  for(const options of [{status:'cancelled'},{status:'canceled'},{status:'pending_payment'},{status:'refunded'},{paid:0},{test:true}]){const excluded=await create(options);await complete(excluded);assert.equal(await snapshot(excluded),undefined);}
  const rows=(await db.query('select * from rental_inventory_profitability($1)',[biz])).rows;assert.equal(rows.find((r:any)=>r.inventory_item_id===b).completed_units,4);
 });
 await t.test('missing assumptions never masquerade as zero loaded cost',async()=>{
  await db.exec(`update inventory_items set expected_lifetime_rentals=null where id='${a}'`);const missing=await create();await complete(missing);assert.equal((await snapshot(missing)).equipment_complete,false);
 });
 await t.test('completion before payment captures when first payment arrives',async()=>{
  const later=await create({paid:0});await complete(later);assert.equal(await snapshot(later),undefined);await db.query('update bookings set amount_paid_cents=100 where id=$1',[later]);assert.ok(await snapshot(later));
 });
 await t.test('shared equipment weights split revenue once and reconcile odd cents',async()=>{
  const shared=await create();
  // Both listing lines consume the same physical inventory; group usage once per resource.
  await db.query('update booking_inventory_reservations set resource_inventory_item_id=$1 where booking_id=$2',[b,shared]);
  await db.query('update bookings set total_cents=44001 where id=$1',[shared]);
  await complete(shared);
  const rows=(await db.query('select * from booking_equipment_allocations where booking_id=$1',[shared])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].quantity,2);assert.equal(rows[0].revenue_cents,41001);
 });
 await t.test('later cancellation excludes retained snapshots from active lifetime reporting',async()=>{
  const before=(await db.query('select * from rental_inventory_profitability($1)',[biz])).rows.find((r:any)=>r.inventory_item_id===b).completed_units;
  await db.query("update bookings set status='cancelled' where id=$1",[id]);
  const after=(await db.query('select * from rental_inventory_profitability($1)',[biz])).rows.find((r:any)=>r.inventory_item_id===b).completed_units;
  assert.equal(before-after,1);assert.ok(await snapshot(id));
 });
 await t.test('tenant RPC authorization and snapshot RLS prevent cross-tenant writes/reads',async()=>{
  await db.exec(`set request.jwt.claim.role='authenticated';set test.business_id='${other}';set test.manager='true';`);
  await assert.rejects(db.query('select finalize_booking_profitability($1,$2,$3::jsonb)',[biz,id,JSON.stringify(cost)]),/Not authorized/);
  await db.exec(`set role authenticated`);
  assert.equal((await db.query('select * from booking_profitability_snapshots')).rows.length,0);
  assert.equal((await db.query('select * from booking_equipment_allocations')).rows.length,0);
  await db.exec('reset role');
 });
 }finally{await db.close();}
});
