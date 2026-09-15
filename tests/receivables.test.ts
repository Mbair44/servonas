import test from "node:test";
import assert from "node:assert/strict";
import {receivableStatus,receivableSummary,type ReceivableRow} from "../lib/financial/receivables.ts";

test("receivable statuses follow actual payment state and schedule",()=>{
 assert.equal(receivableStatus({remainingCents:0,scheduledFor:"2026-09-20"},"2026-09-15"),"paid");
 assert.equal(receivableStatus({remainingCents:100,scheduledFor:"2026-09-20"},"2026-09-15"),"scheduled");
 assert.equal(receivableStatus({remainingCents:100,scheduledFor:"2026-09-15"},"2026-09-15"),"due");
 assert.equal(receivableStatus({remainingCents:100,scheduledFor:"2026-09-14"},"2026-09-15"),"past_due");
 assert.equal(receivableStatus({remainingCents:100,scheduledFor:"2026-09-20",paymentStatus:"processing"},"2026-09-15"),"processing");
 assert.equal(receivableStatus({remainingCents:100,scheduledFor:"2026-09-20",paymentStatus:"failed"},"2026-09-15"),"failed");
});

test("receivable summary excludes paid balances and separates future and attention totals",()=>{
 const row=(id:string,remainingCents:number,scheduledFor:string,status:ReceivableRow["status"]):ReceivableRow=>({id,source:"booking",customer:"Customer",customerId:null,reference:id,jobId:null,eventDate:null,totalCents:remainingCents,paidCents:0,remainingCents,scheduledFor,paymentMethod:null,status,failureMessage:null});
 const summary=receivableSummary([row("seven",100,"2026-09-20","scheduled"),row("month",200,"2026-10-01","scheduled"),row("late",300,"2026-09-14","past_due"),row("paid",0,"2026-09-15","paid")],"2026-09-15");
 assert.deepEqual(summary,{outstanding:600,next7:100,next30:300,pastDue:300});
});
