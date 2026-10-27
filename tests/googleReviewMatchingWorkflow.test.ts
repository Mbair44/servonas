import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const actions=read("../app/app/[businessSlug]/reviews/actions.ts");
const customerSearch=read("../app/api/google-business/reviews/customers/[businessSlug]/route.ts");
const page=read("../app/app/[businessSlug]/reviews/page.tsx");
const dashboard=read("../components/GoogleReviewsDashboard.tsx");
const migration=read("../supabase/migrations/20261027000200_google_review_match_audits.sql");
const guardRepair=read("../supabase/migrations/20261027000300_fix_google_review_match_tenant_guard.sql");
const trackingMigration=read("../supabase/migrations/20261020000100_google_review_tracking.sql");

test("manual selection is tenant-scoped and requires a later explicit confirmation",()=>{
 assert.match(actions,/canManageBusiness\(workspace\.role\)/);
 assert.match(actions,/eq\("business_id",businessId\)/);
 assert.match(actions,/status:"suggested"/);
 assert.match(dashboard,/Choose &amp; confirm next/);
 assert.match(dashboard,/Confirm Match/);
 assert.match(dashboard,/Only confirmation suppresses future review-request SMS/);
});

test("matching queries and mutations are limited to the authenticated business",()=>{
 assert.match(customerSearch,/requireWorkspace\(businessSlug\)/);
 assert.match(customerSearch,/canManageBusiness\(role\)/);
 assert.match(customerSearch,/eq\("business_id",business\.id\)/);
 assert.match(customerSearch,/\.in\("customer_id",ids\)/);
 assert.match(actions,/requireOwnedReviewAndCustomer/);
 assert.match(actions,/Only business owners and administrators/);
});

test("confirmed matches cannot conflict and removals preserve correction workflow",()=>{
 assert.match(actions,/Remove the existing confirmed match before confirming another customer/);
 assert.match(actions,/Remove the confirmed match before selecting another customer/);
 assert.match(actions,/google_review_customer_matches"\)\.delete\(\)/);
 assert.match(dashboard,/Remove match/);
 assert.match(migration,/owners and admins manage review matches/);
 assert.match(trackingMigration,/google_review_one_confirmed_customer_idx/);
});

test("match changes are auditable and retain existing review-request suppression semantics",()=>{
 assert.match(migration,/google_review_match_audits/);
 assert.match(migration,/validate_google_review_match_audit_tenant/);
 assert.match(migration,/owners and admins create review match audits/);
 assert.match(actions,/Could not record the review-match change/);
 assert.match(trackingMigration,/m\.status='confirmed'/);
 assert.match(guardRepair,/if tg_table_name='google_review_customer_matches' then/);
 assert.match(guardRepair,/elsif tg_table_name='customer_review_overrides' then/);
});

test("review dashboard includes status metrics, search, filters, compact actions, and pagination",()=>{
 assert.match(page,/GoogleReviewsDashboard/);
 assert.match(dashboard,/Total reviews/);
 assert.match(dashboard,/Suggested matches/);
 assert.match(dashboard,/Confirmed matches/);
 assert.match(dashboard,/Search reviewer name/);
 assert.match(dashboard,/\[\["all","All"\],\["suggested","Suggested"\],\["matched","Matched"\],\["unmatched","Unmatched"\]\]/);
 assert.match(dashboard,/reviews-pagination/);
 assert.match(dashboard,/No reviews found/);
});
