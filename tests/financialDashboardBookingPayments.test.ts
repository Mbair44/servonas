import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../supabase/migrations/20260911000500_include_booking_payments_in_dashboard.sql", import.meta.url);
const bookingPolicyMigration = new URL("../supabase/migrations/20260911000700_allow_financial_summary_to_read_bookings.sql", import.meta.url);

test("financial dashboard combines invoice transactions and booking deposits without double counting", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /from public\.payments p/);
  assert.match(sql, /from public\.bookings b/);
  assert.match(sql, /b\.amount_paid_cents::bigint/);
  assert.match(sql, /coalesce\(b\.refunded_cents,0\)::bigint/);
  assert.match(sql, /p\.booking_id is null or p\.invoice_id is not null/);
  assert.match(sql, /at time zone coalesce\(v_timezone,'UTC'\)/);
});

test("financial dashboard callers can read tenant-scoped booking deposits through RLS", async () => {
  const sql = await readFile(bookingPolicyMigration, "utf8");
  assert.match(sql, /on public\.bookings for select to authenticated/);
  assert.match(sql, /public\.has_business_role\(business_id,array\['owner','admin','manager'\]\)/);
});
