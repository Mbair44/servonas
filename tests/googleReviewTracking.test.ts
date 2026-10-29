import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const migration=read("../supabase/migrations/20261020000100_google_review_tracking.sql");
const oneDayWindowMigration=read("../supabase/migrations/20261029000100_review_request_one_day_window.sql");
const sender=read("../lib/communications/rentalLifecycleSms.ts");
const eligibility=read("../lib/googleReviewEligibility.ts");
const sync=read("../lib/googleBusinessProfile.ts");
const cron=read("../app/api/cron/google-reviews/route.ts");
const messagesCron=read("../app/api/cron/messages/route.ts");

test("confirmed reviews suppress only at the final pre-Twilio check; suggestions do not",()=>{
 assert.match(sender,/claimGoogleReviewRequestEligibility/);
 assert.ok(sender.lastIndexOf("claimGoogleReviewRequestEligibility")<sender.lastIndexOf("sendTenantTwilioMessage"));
 assert.match(migration,/m\.status='confirmed'/);
 assert.match(migration,/status in \('suggested','confirmed','rejected'\)/);
});

test("manual overrides, repeat customers, and tenant/location isolation use canonical tenant-scoped records",()=>{
 assert.match(migration,/customer_review_overrides/);
 assert.match(migration,/o\.google_location_id is null or o\.google_location_id=p_google_location_id/);
 assert.match(migration,/Review match tenant mismatch/);
 assert.match(migration,/Review override tenant mismatch/);
 assert.match(eligibility,/business_google_locations/);
});

test("queued pre-deployment events and retries receive a leased final eligibility decision",()=>{
 assert.match(migration,/claim_review_request_event/);
 assert.match(migration,/interval '5 minutes'/);
 assert.match(sender,/claim_review_request_event/);
 assert.match(sender,/processing_started_at/);
 assert.match(sender,/status:"suppressed"/);
 assert.match(messagesCron,/pendingReviewEvents/);
 assert.match(oneDayWindowMigration,/returning \* into v_event/);
 assert.match(oneDayWindowMigration,/return query select v_event\.id,true/);
 assert.match(oneDayWindowMigration,/review_request_window_elapsed/);
 assert.match(messagesCron,/booking_items\.rental_date",yesterday/);
});

test("failed review sync retains last known confirmed records and does not activate automatically",()=>{
 assert.match(sync,/google_review_sync_runs/);
 assert.match(sync,/status:permission\?"permissions_error":"failed"/);
 assert.match(cron,/GOOGLE_REVIEW_SYNC_ENABLED!=="true"/);
 assert.match(cron,/CRON_SECRET/);
});
