import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fulfillPaidRentalBooking} from "../lib/rentalPaymentFulfillment.ts";

function fulfillment(overrides:Partial<Parameters<typeof fulfillPaidRentalBooking>[0]>={}){
 const calls:string[]=[];
 const steps={
  confirmBooking:async()=>{calls.push("booking");},
  confirmItems:async()=>{calls.push("items");},
  ensureJob:async()=>{calls.push("job");return "job-1";},
  saveFinalPaymentAuthorization:async()=>{calls.push("authorization");},
  ...overrides,
 };
 return {calls,run:()=>fulfillPaidRentalBooking(steps)};
}

test("successful paid rental fulfillment creates the job before completion metadata",async()=>{
 const flow=fulfillment();
 assert.equal(await flow.run(),"job-1");
 assert.deepEqual(flow.calls,["booking","items","job","authorization"]);
});

test("job creation failure remains retryable and a later retry succeeds",async()=>{
 let attempts=0;
 const flow=fulfillment({ensureJob:async()=>{attempts+=1;if(attempts===1)throw new Error("temporary database failure");return "job-1";}});
 await assert.rejects(flow.run(),/temporary database failure/);
 assert.equal(await flow.run(),"job-1");
 assert.equal(attempts,2);
});

test("authorization persistence failure cannot leave a paid rental without a job",async()=>{
 let jobs=0,authorizationAttempts=0;
 const flow=fulfillment({
  ensureJob:async()=>{jobs=Math.max(jobs,1);return "job-1";},
  saveFinalPaymentAuthorization:async()=>{authorizationAttempts+=1;if(authorizationAttempts===1)throw new Error("schema cache mismatch");},
 });
 await assert.rejects(flow.run(),/schema cache mismatch/);
 assert.equal(jobs,1);
 assert.equal(await flow.run(),"job-1");
 assert.equal(jobs,1);
});

test("repeated fulfillment for the same booking resolves to exactly one job",async()=>{
 let createdJob:string|null=null,insertCount=0;
 const ensureJob=async()=>{if(!createdJob){createdJob="job-1";insertCount+=1;}return createdJob;};
 const first=fulfillment({ensureJob}),second=fulfillment({ensureJob});
 assert.deepEqual(await Promise.all([first.run(),second.run()]),["job-1","job-1"]);
 assert.equal(insertCount,1);
});

test("webhook recovery uses stable Stripe and booking identifiers without creating another charge",async()=>{
 const [route,job,migration]=await Promise.all([
  readFile(new URL("../app/api/stripe/webhook/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../lib/rentalBookingJob.ts",import.meta.url),"utf8"),
  readFile(new URL("../supabase/migrations/20260910000100_repair_rental_payment_fulfillment.sql",import.meta.url),"utf8"),
 ]);
 assert.match(route,/provider_event_id:event\.id/);
 assert.match(route,/checkout_session_id:session\.id/);
 assert.match(route,/payment_intent_id:paymentIntentId/);
 assert.match(route,/processing_status:"failed"/);
 assert.match(route,/PAID BOOKING FAILED TO CREATE JOB/);
 assert.match(route,/paid_booking_fulfillment_failed/);
 assert.doesNotMatch(route,/paymentIntents\.create/);
 assert.doesNotMatch(route,/checkout\.sessions\.create/);
 assert.match(job,/request_key:booking\.id/);
 assert.match(job,/jobError\?\.code==="23505"/);
 assert.match(migration,/jobs_business_request_key_unique/);
 assert.match(migration,/bookings_stripe_checkout_session_unique/);
});
