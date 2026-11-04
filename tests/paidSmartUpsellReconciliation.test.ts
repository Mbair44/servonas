import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const staged=readFileSync(new URL("../lib/bookingManage/stagedAmendments.ts",import.meta.url),"utf8");
const additions=readFileSync(new URL("../lib/bookingManage/addRentalItems.ts",import.meta.url),"utf8");

test("paid staged amendments remain compatible with the database's atomic claim",()=>{
 assert.match(staged,/status:"pending_payment",paid_at:amendment\.paid_at\?\?new Date\(\)\.toISOString\(\)/);
 assert.match(staged,/\.select\("id"\)\.maybeSingle\(\)/);
 assert.match(staged,/if\(claimError\|\|!claimed\)/);
 assert.match(staged,/\["pending_payment","payment_processing"\]\.includes\(amendment\.status\)/);
 assert.match(staged,/amendment\.status==="application_failed"&&paidBeforeExpiry/);
 assert.match(staged,/paid_at:amendment\.paid_at\?\?new Date\(\)\.toISOString\(\)/);
});

test("staged additions send the immutable held item payload",()=>{
 assert.match(additions,/const requestedItems=input\.amendmentId/);
 assert.match(additions,/inventoryItemId:item\.inventoryItemId,quantity:Number\(item\.quantity\)/);
 assert.match(additions,/expectedRentalUnitPriceCents/);
});
