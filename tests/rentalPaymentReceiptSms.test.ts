import test from "node:test";
import assert from "node:assert/strict";
import {rentalLifecycleSmsBody} from "../lib/communications/rentalLifecycleSms.ts";
import {authoritativeBookingBalance} from "../lib/financial/rentalCompletionBalance.ts";

test("a fully paid rental receipt never repeats the received payment as a balance",()=>{
 const balance=authoritativeBookingBalance(10125,10125,10125);
 assert.equal(balance,0);
 const body=rentalLifecycleSmsBody("payment_receipt","Copper State Bounce",["Monsoon Madness Inflatable Pool"],"2026-11-02",{amountCents:10125,balanceDueCents:balance,receiptUrl:"https://example.com/receipt/token"});
 assert.match(body,/paid in full/i);
 assert.doesNotMatch(body,/Remaining balance:/);
 assert.match(body,/View your receipt and full charges: https:\/\/example\.com\/receipt\/token/);
});
