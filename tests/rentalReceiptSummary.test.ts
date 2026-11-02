import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("rental SMS receipts use cumulative booking totals and active SMS consent",async()=>{
 const [sms,actions,email]=await Promise.all([
  readFile(new URL("../lib/communications/rentalLifecycleSms.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/app/[businessSlug]/jobs/actions.ts",import.meta.url),"utf8"),
  readFile(new URL("../lib/communications/invoiceEmailService.ts",import.meta.url),"utf8"),
 ]);
 assert.match(sms,/amountCents: Number\(booking\.amount_paid_cents \?\? 0\)/);
 assert.doesNotMatch(sms,/input\.type === "payment_receipt" && !payment/);
 assert.match(actions,/customer\?\.sms_consent_status === "express" \? "sms"/);
 assert.match(actions,/bookingId: booking\?\.id, type: "payment_receipt"/);
 assert.match(email,/amountCents:Math\.max\(0,Number\(i\.amount_paid_cents\?\?0\)-Number\(i\.amount_refunded_cents\?\?0\)\)/);
});
