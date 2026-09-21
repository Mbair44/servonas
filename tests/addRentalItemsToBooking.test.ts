import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20260921000100_add_rental_items_to_existing_booking.sql",import.meta.url),"utf8");
const service=readFileSync(new URL("../lib/bookingManage/addRentalItems.ts",import.meta.url),"utf8");

test("adding rental items is service-role-only and transactionally locks the booking/resources",()=>{
 assert.match(sql,/auth\.role\(\) <> 'service_role'/);
 assert.match(sql,/for update/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/booking_inventory_reservations/);
 assert.match(sql,/booking_id<>p_booking_id/);
 assert.match(sql,/Added rental items/);
});
test("item additions use server snapshots and preserve financial history while recalculating balance",()=>{
 assert.match(sql,/price adjustments are rebuilt from tenant data/);
 assert.match(sql,/option_selections/);
 assert.match(sql,/v_balance:=v_total-coalesce\(v_booking\.amount_paid_cents,0\)/);
 assert.doesNotMatch(sql,/insert into public\.payments/);
 assert.doesNotMatch(sql,/delete from public\.booking_items/);
});
test("item additions are idempotent, audited, and retain tenant isolation",()=>{
 assert.match(sql,/p_idempotency_key/);
 assert.match(sql,/change_type='rental_items_added'/);
 assert.match(sql,/booking_change_audit/);
 assert.match(sql,/business_id=p_business_id for update/);
});
test("unavailable and shared inventory failures occur before any booking item insert",()=>{
 const insert=sql.indexOf("insert into public.booking_items");
 assert.ok(sql.indexOf("not i.active")<insert);
 assert.ok(sql.indexOf("v_reserved+v_resource.requested_quantity>v_resource.stock_quantity")<insert);
 assert.ok(sql.indexOf("blocked during that rental period")<insert);
});
test("all financial snapshots are recalculated after line insertion without charging or refunding",()=>{
 const insert=sql.indexOf("insert into public.booking_items");
 assert.ok(sql.indexOf("sum(unit_price_cents*quantity+option_adjustment_cents*quantity+duration_adjustment_cents*quantity+operator_charge_cents)")>insert);
 assert.match(sql,/discount_snapshot=p_discount_snapshot/);
 assert.match(sql,/coalesce\(v_booking\.tax_cents,0\)/);
 assert.doesNotMatch(sql,/stripe|refund/i);
});
test("the service accepts selectors only and recalculates an existing promotion before the RPC",()=>{
 assert.match(service,/validateRentalPromo/);
 assert.match(service,/calculateRentalUnitPrice/);
 assert.match(service,/p_discount_snapshot:discountSnapshot/);
 assert.match(service,/p_items:input\.items/);
 assert.doesNotMatch(service,/priceCents:/);
});
