import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20260927000300_schedule_authorized_booking_balance_charges.sql",import.meta.url),"utf8");

test("future-card authorization schedules the remaining booking balance at rental end",()=>{
  assert.match(migration,/create trigger schedule_authorized_booking_balance_charge/);
  assert.match(migration,/new\.final_payment_authorized_at is not null/);
  assert.match(migration,/new\.stripe_customer_id is not null/);
  assert.match(migration,/new\.stripe_payment_method_id is not null/);
  assert.match(migration,/new\.balance_charge_scheduled_for:=coalesce\(new\.rental_ends_at,new\.rental_starts_at\)/);
});

test("backfill schedules only future, authorized bookings with a remaining balance",()=>{
  assert.match(migration,/coalesce\(balance_due_cents,0\)>0/);
  assert.match(migration,/and status in \('confirmed','paid','completed'\)/);
  assert.match(migration,/coalesce\(rental_ends_at,rental_starts_at\)>now\(\)/);
  assert.doesNotMatch(migration,/paymentIntents|stripeClient\(\)|payment_intent/i);
});
