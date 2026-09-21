import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20260921000200_staged_booking_item_amendments.sql",import.meta.url),"utf8");
const staged=readFileSync(new URL("../lib/bookingManage/stagedAmendments.ts",import.meta.url),"utf8");
const webhook=readFileSync(new URL("../app/api/stripe/webhook/route.ts",import.meta.url),"utf8");
const availability=readFileSync(new URL("../app/api/public-booking/[businessSlug]/rental-availability/route.ts",import.meta.url),"utf8");

test("staged amendments have expiring, tenant-scoped resource holds",()=>{
 assert.match(sql,/booking_amendments/);
 assert.match(sql,/booking_amendment_inventory_holds/);
 assert.match(sql,/expires_at/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/auth\.role\(\)<>'service_role'/);
});
test("active holds block normal availability and permanent reservation writes",()=>{
 assert.match(availability,/booking_amendment_inventory_holds/);
 assert.match(sql,/reject_reservation_conflicting_with_amendment_hold/);
 assert.match(sql,/booking_inventory_reservations_amendment_hold_guard/);
 assert.match(sql,/status in \('pending_payment','payment_processing'\)/);
});
test("staging calculates an incremental tenant deposit and starts Checkout only when needed",()=>{
 assert.match(staged,/incrementalDepositCents/);
 assert.match(staged,/Math\.round\(Math\.max\(0,input\.newTotalCents\).*depositPercent/);
 assert.match(staged,/if\(requiredPaymentCents===0\)/);
 assert.match(staged,/payment_kind:"booking_item_amendment"/);
});
test("paid webhook is idempotent and leaves an application failure recoverable",()=>{
 assert.match(webhook,/payment_kind===\"booking_item_amendment\"/);
 assert.match(webhook,/beginPaidRentalEvent/);
 assert.match(webhook,/booking_amendment_application_failed/);
 assert.match(staged,/status:"application_failed"/);
 assert.match(staged,/addRentalItemsToBooking/);
});
test("failed or expired Checkout releases the amendment hold without altering the booking",()=>{
 assert.match(webhook,/payment failed/);
 assert.match(webhook,/checkout expired/);
 assert.doesNotMatch(staged,/delete\(.*bookings/);
});
