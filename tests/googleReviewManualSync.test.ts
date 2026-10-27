import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const route=read("../app/api/google-business/reviews/sync/[businessSlug]/route.ts");
const sync=read("../lib/googleBusinessProfile.ts");
const page=read("../app/app/[businessSlug]/settings/website/page.tsx");
const migration=read("../supabase/migrations/20261027000100_google_review_manual_sync.sql");
const button=read("../components/GoogleReviewsSyncButton.tsx");

test("manual review sync resolves the tenant from the authenticated workspace",()=>{
 assert.match(route,/requireWorkspace\(businessSlug\)/);
 assert.match(route,/canManageBusiness\(role\)/);
 assert.match(route,/syncGoogleBusinessReviews\(business\.id\)/);
 assert.doesNotMatch(route,/request\.json|businessId/);
 assert.match(route,/status:403/);
});

test("manual review sync rejects concurrent and repeated requests",()=>{
 assert.match(migration,/google_review_sync_runs_one_active_per_business_idx/);
 assert.match(migration,/where status='started'/);
 assert.match(sync,/GoogleReviewSyncConflictError/);
 assert.match(sync,/manualReviewSyncCooldownMs=5\*60\*1000/);
 assert.match(route,/status:409/);
 assert.match(route,/status:429/);
});

test("manual sync persists and displays safe review-sync results",()=>{
 assert.match(migration,/records_inserted integer/);
 assert.match(migration,/records_updated integer/);
 assert.match(sync,/recordsSeen:seen,recordsInserted:inserted,recordsUpdated:updated/);
 assert.match(page,/Last successful sync:/);
 assert.match(page,/Last sync error:/);
 assert.match(button,/does not send messages or confirm customer matches/);
});

test("review syncing keeps the existing Google review ID deduplication and suggestion behavior",()=>{
 assert.match(sync,/onConflict:"google_location_id,google_review_id"/);
 assert.match(sync,/status:"suggested"/);
 assert.doesNotMatch(route,/review_request|sendTenantTwilioMessage|confirmed/);
});
