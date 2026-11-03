import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("rescheduling a job moves linked rental timing and an existing balance charge",async()=>{
 const sql=await readFile(new URL("../supabase/migrations/20261102000200_reschedule_linked_booking_operations.sql",import.meta.url),"utf8");
 assert.match(sql,/create trigger reschedule_linked_booking_operations/);
 assert.match(sql,/rental_starts_at=new\.starts_at/);
 assert.match(sql,/rental_ends_at=new\.ends_at/);
 assert.match(sql,/balance_charge_scheduled_for=case/);
 assert.match(sql,/b\.balance_charge_scheduled_for is not null/);
});

test("rescheduling suppresses unsent Smart Upsell SMS and allows a new dated offer",async()=>{
 const [sql,scheduler]=await Promise.all([
  readFile(new URL("../supabase/migrations/20261102000200_reschedule_linked_booking_operations.sql",import.meta.url),"utf8"),
  readFile(new URL("../lib/smartUpsellSms.ts",import.meta.url),"utf8"),
 ]);
 assert.match(sql,/smart_upsell_sms_deliveries/);
 assert.match(sql,/status='skipped'/);
 assert.match(sql,/o\.status='pending'/);
 assert.match(sql,/status='canceled'/);
 assert.match(scheduler,/requestKey:`smart-upsell:\$\{booking\.id\}:\$\{booking\.rental_starts_at\}`/);
});
