import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../app/receipt/[token]/page.tsx",import.meta.url),"utf8");

test("public receipt renders the business joined to its booking",()=>{
 assert.match(source,/businesses\(name\)/);
 assert.match(source,/business = Array\.isArray\(data\.businesses\)/);
 assert.match(source,/<h1>\{business\?\.name \|\| "Payment receipt"\}<\/h1>/);
 assert.doesNotMatch(source,/NRS Party Rentals/);
});

test("receipt separates the initial deposit from later balance payments",()=>{
 assert.match(source,/amount_paid_cents/);
 assert.match(source,/const balancePaymentCents = Math\.max\(0, amountPaidCents - depositPaidCents\)/);
 assert.match(source,/Balance payment received/);
 assert.match(source,/Total paid/);
});
