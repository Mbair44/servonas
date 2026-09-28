import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {pricingTestClient} from "./fixtures/pglitePricingClient.ts";
import {resolveRentalItemPrice} from "../lib/rentalDatePricing.ts";
import {listRentalPricingRules,saveRentalPricingRule,deleteRentalPricingRule} from "../lib/rentalPricingRuleService.ts";
import {previewRentalDateChange} from "../lib/bookingManage/datePricePreview.ts";
const root=process.env.PGLITE_TEST_ROOT;
// Optional temporary PostgreSQL runtime; see docs/rental-date-pricing.md for the command.
test("date pricing migration and reservation transactions in PostgreSQL",{skip:!root},async t=>{
 const {PGlite}=await import(`${root}/dist/index.js`),{btree_gist}=await import(`${root}/dist/contrib/btree_gist.js`);
 const db=new PGlite({extensions:{btree_gist}});
 const read=(file:string)=>readFile(new URL(file,import.meta.url),"utf8");
 await db.exec(await read("./fixtures/rentalDatePricing.sql"));
 const original=await read("../supabase/migrations/20260911000200_shared_rental_inventory.sql");
 await db.exec(original.slice(original.indexOf("create or replace function public.create_public_booking_quantities_timed("),original.indexOf("create or replace function public.rental_inventory_performance(")));
 await db.exec(await read("../supabase/migrations/20260921000100_add_rental_items_to_existing_booking.sql"));
 await db.exec(await read("../supabase/migrations/20260928000200_rental_date_pricing.sql"));
 const a="00000000-0000-4000-8000-000000000001",b="00000000-0000-4000-8000-000000000002",item="00000000-0000-4000-8000-000000000003",other="00000000-0000-4000-8000-000000000004";
 await db.exec(`insert into businesses values('${a}'),('${b}');insert into booking_settings(business_id) values('${a}'),('${b}');insert into inventory_items(id,business_id,daily_price_cents) values('${item}','${a}',22500),('${other}','${b}',10000);insert into rental_listing_inventory_requirements values('${item}','${item}',1);`);
 const resolve=async(date:string,id=item,biz=a)=>(await db.query("select resolve_rental_date_price($1,$2,$3) as price",[biz,id,date])).rows[0].price;
 const rule=async(type:string,price:number,day:number|null,start:string|null,end:string|null)=>db.query("insert into rental_item_pricing_rules(business_id,rental_item_id,rule_type,fixed_price_cents,day_of_week,start_date,end_date) values($1,$2,$3,$4,$5,$6,$7) returning id",[a,item,type,price,day,start,end]);
 await t.test("no rule retains base price and tenant ownership is enforced",async()=>{
  assert.equal((await resolve("2026-10-26")).dateAdjustedBasePriceCents,22500);
  await assert.rejects(resolve("2026-10-26",other),/not found/);
  await assert.rejects(db.query("insert into rental_item_pricing_rules(business_id,rental_item_id,rule_type,day_of_week,fixed_price_cents) values($1,$2,'day_of_week',6,1)",[b,item]),/foreign key/);
 });
 await t.test("Saturday override; Monday falls back; duplicate weekday rejected",async()=>{
  await rule("day_of_week",27500,6,null,null);
  assert.equal((await resolve("2026-10-31")).dateAdjustedBasePriceCents,27500);
  assert.equal((await resolve("2026-10-26")).dateAdjustedBasePriceCents,22500);
  await assert.rejects(rule("day_of_week",30000,6,null,null),/unique/);
 });
 await t.test("inclusive range wins over weekday; overlaps rejected; specific date wins",async()=>{
  await rule("date_range",32500,null,"2026-10-30","2026-10-31");
  for(const date of ["2026-10-30","2026-10-31"])assert.equal((await resolve(date)).dateAdjustedBasePriceCents,32500);
  await assert.rejects(rule("date_range",40000,null,"2026-10-31","2026-11-02"),/exclusion/);
  await rule("specific_date",35000,null,"2026-10-31","2026-10-31");
  assert.equal((await resolve("2026-10-31")).appliedDateRuleType,"specific_date");
  assert.equal((await resolve("2026-11-01")).dateAdjustedBasePriceCents,22500);
 });
 await t.test("invalid rule field combinations rejected",async()=>{
  await assert.rejects(rule("day_of_week",100,null,null,null),/check constraint/);
  await assert.rejects(rule("specific_date",100,null,"2026-10-31","2026-11-01"),/check constraint/);
 });
 let bookingId:string;
 await t.test("SQL checkout applies start-date price then existing multi-day arithmetic and snapshots it",async()=>{
  const result=await db.query("select * from create_public_booking_quantities_timed($1::jsonb,'2026-10-31','2026-11-01','Test','Customer','test@example.com','555','09:00','17:00','123 Main','Mesa','85201','')",[JSON.stringify([{inventoryItemId:item,quantity:1,price:1}])]);
  bookingId=result.rows[0].booking_id;
  const row=(await db.query("select * from booking_items where booking_id=$1",[bookingId])).rows[0];
  assert.equal(row.unit_price_cents,61250);assert.equal(row.base_unit_price_cents,35000);assert.equal(row.additional_day_unit_price_cents,26250);
  assert.equal(row.date_pricing_snapshot.originalBasePriceCents,22500);
  assert.equal(row.date_pricing_snapshot.appliedDateRuleType,"specific_date");
 });
 await t.test("rule edit/delete never reprices booked lines",async()=>{
  await db.exec("update rental_item_pricing_rules set fixed_price_cents=99900 where rule_type='specific_date'");
  await db.exec("delete from rental_item_pricing_rules where rule_type='specific_date'");
  const row=(await db.query("select unit_price_cents,date_pricing_snapshot from booking_items where booking_id=$1",[bookingId])).rows[0];
  assert.equal(row.unit_price_cents,61250);assert.equal(row.date_pricing_snapshot.dateAdjustedBasePriceCents,35000);
 });
 await t.test("new additions use current booking start-date pricing without changing existing lines",async()=>{
  await db.query("select add_rental_items_to_booking($1,$2,$3::jsonb,0,null,'add-one','staff',null)",[a,bookingId,JSON.stringify([{inventoryItemId:item,quantity:1,expectedRentalUnitPriceCents:56875}])]);
  const rows=(await db.query("select unit_price_cents from booking_items where booking_id=$1 order by created_at",[bookingId])).rows;
  assert.deepEqual(rows.map((row:any)=>row.unit_price_cents),[61250,56875]);
 });
 await t.test("staged additions honor their frozen quote after rules are edited",async()=>{
  const booked=(await db.query("select subtotal_cents,total_cents from bookings where id=$1",[bookingId])).rows[0];
  const snapshot=await resolve("2026-10-31"),amendment="00000000-0000-4000-8000-000000000005";
  const requested=[{inventoryItemId:item,quantity:1}];
  const added={id:item,quantity:1,unitPriceCents:56875,baseUnitPriceCents:32500,additionalDayUnitPriceCents:24375,datePricingSnapshot:snapshot,optionAdjustmentCents:0,optionSelections:[]};
  await db.query("insert into booking_amendments(id,business_id,booking_id,status,expires_at,requested_items,pricing_snapshot,old_totals,new_totals) values($1,$2,$3,'payment_processing',now()+interval '1 hour',$4,$5,$6,$7)",[amendment,a,bookingId,JSON.stringify(requested),JSON.stringify({added:[added]}),JSON.stringify(booked),JSON.stringify({subtotal_cents:booked.subtotal_cents+56875})]);
  await db.exec("update rental_item_pricing_rules set fixed_price_cents=90000 where rule_type='date_range'");
  await db.query("select add_rental_items_to_booking($1,$2,$3::jsonb,0,null,'stage-one','staff',$4)",[a,bookingId,JSON.stringify(requested),amendment]);
  const rows=(await db.query("select unit_price_cents,date_pricing_snapshot from booking_items where booking_id=$1 order by created_at",[bookingId])).rows;
  assert.equal(rows[2].unit_price_cents,56875);assert.equal(rows[2].date_pricing_snapshot.dateAdjustedBasePriceCents,32500);
 });
 await t.test("stale direct additions fail atomically",async()=>{
  const before=(await db.query("select count(*)::int as n from booking_items")).rows[0].n;
  await assert.rejects(db.query("select add_rental_items_to_booking($1,$2,$3::jsonb,0,null,'stale','staff',null)",[a,bookingId,JSON.stringify([{inventoryItemId:item,quantity:1,expectedRentalUnitPriceCents:1}])]),/pricing changed/);
  assert.equal((await db.query("select count(*)::int as n from booking_items")).rows[0].n,before);
 });
 await t.test("management services create, list, edit, deactivate, delete and report overlap errors",async()=>{
  const client=pricingTestClient(db);
  const weekday=await saveRentalPricingRule(client,a,item,{rule_type:"day_of_week",day_of_week:1,fixed_price_cents:26000});
  assert.equal((await listRentalPricingRules(client,a,item)).some((r:any)=>r.id===weekday.id),true);
  await saveRentalPricingRule(client,a,item,{rule_type:"day_of_week",day_of_week:1,fixed_price_cents:27000},weekday.id);
  assert.equal((await resolve("2026-10-26")).dateAdjustedBasePriceCents,27000);
  await saveRentalPricingRule(client,a,item,{rule_type:"day_of_week",day_of_week:1,fixed_price_cents:27000,active:false},weekday.id);
  assert.equal((await resolve("2026-10-26")).dateAdjustedBasePriceCents,22500);
  const range=await saveRentalPricingRule(client,a,item,{rule_type:"date_range",start_date:"2027-01-01",end_date:"2027-01-03",fixed_price_cents:40000,name:"New year"});
  await saveRentalPricingRule(client,a,item,{rule_type:"date_range",start_date:"2027-01-01",end_date:"2027-01-04",fixed_price_cents:41000},range.id);
  await assert.rejects(saveRentalPricingRule(client,a,item,{rule_type:"date_range",start_date:"2027-01-04",end_date:"2027-01-05",fixed_price_cents:41000}),/overlap/);
  const specific=await saveRentalPricingRule(client,a,item,{rule_type:"specific_date",start_date:"2027-01-01",fixed_price_cents:42000});
  await saveRentalPricingRule(client,a,item,{rule_type:"specific_date",start_date:"2027-01-01",fixed_price_cents:43000},specific.id);
  assert.equal((await resolveRentalItemPrice(client,{businessId:a,rentalItemId:item,rentalDate:"2027-01-01"})).finalRentalPriceCents,43000);
  await assert.rejects(deleteRentalPricingRule(client,b,item,specific.id),/not found/);
  await deleteRentalPricingRule(client,a,item,specific.id);await deleteRentalPricingRule(client,a,item,range.id);
  assert.equal((await resolve("2027-01-01")).dateAdjustedBasePriceCents,22500);
 });
 await t.test("date-change preview returns financial difference and never mutates the booking",async()=>{
  const before=(await db.query("select to_jsonb(b) as booking from bookings b where id=$1",[bookingId])).rows[0].booking;
  const lines=(await db.query("select to_jsonb(bi) as item from booking_items bi where booking_id=$1 order by created_at",[bookingId])).rows;
  const preview=await previewRentalDateChange(pricingTestClient(db),{businessId:a,bookingId,rentalDate:"2026-11-07",rentalEndDate:"2026-11-08"});
  assert.equal(preview.applied,false);assert.equal(preview.requiresConfirmation,true);assert.ok(preview.differenceCents<0);
  assert.equal(preview.items[0].price.dateAdjustedBasePriceCents,27500);
  assert.deepEqual((await db.query("select to_jsonb(b) as booking from bookings b where id=$1",[bookingId])).rows[0].booking,before);
  assert.deepEqual((await db.query("select to_jsonb(bi) as item from booking_items bi where booking_id=$1 order by created_at",[bookingId])).rows,lines);
 });
 await t.test("authenticated tenant isolation and staff denial",async()=>{
  await db.exec(`set request.jwt.claim.role='authenticated';set test.business_id='${b}';set test.manager='true';`);
  await assert.rejects(resolve("2026-10-31"),/Not authorized/);
  await db.exec(`set test.business_id='${a}';set test.manager='false';`);
  await assert.rejects(resolve("2026-10-31"),/Not authorized/);
  await db.exec(`set role authenticated;set test.business_id='${a}';set test.manager='true';`);
  assert.ok((await db.query("select count(*)::int as n from rental_item_pricing_rules")).rows[0].n>0);
  await db.exec(`set test.business_id='${b}';`);
  assert.equal((await db.query("select count(*)::int as n from rental_item_pricing_rules")).rows[0].n,0);
  await assert.rejects(rule("day_of_week",100,2,null,null),/row-level security/);
  await db.exec("reset role;set request.jwt.claim.role='service_role'");
 });
 await db.close();
});
