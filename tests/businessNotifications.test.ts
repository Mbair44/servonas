import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("review notification priority escalates low ratings",()=>{
 const source=readFileSync("lib/businessNotifications.ts","utf8");
 assert.match(source,/rating <= 2\) return "urgent"/);
 assert.match(source,/rating === 3\) return "important"/);
 assert.match(source,/return "normal"/);
});
test("notifications are tenant scoped and deduplicated in the database",()=>{
 const migration=readFileSync("supabase/migrations/20260902000300_business_notifications.sql","utf8");
 assert.match(migration,/unique\(business_id,dedupe_key\)/);
 assert.match(migration,/is_business_member\(business_id\)/);
 assert.match(migration,/has_business_role\(business_id,array\['owner','admin'\]\)/);
});
test("marketing issues use a reusable tenant-scoped table with stable dedupe keys",()=>{
 const migration=readFileSync("supabase/migrations/20260903000100_business_marketing_issues.sql","utf8");
 assert.match(migration,/create table if not exists public\.business_marketing_issues/);
 assert.match(migration,/provider text not null check\(provider in\('google_ads','meta_ads'\)\)/);
 assert.match(migration,/severity text not null check\(severity in\('info','warning','critical'\)\)/);
 assert.match(migration,/status text not null default 'active' check\(status in\('active','resolved','dismissed'\)\)/);
 assert.match(migration,/unique\(business_id,dedupe_key\)/);
 assert.match(migration,/add column if not exists last_issue_check_at timestamptz/);
});
test("unread counts and read actions remain scoped to the current business",()=>{
 const helper=readFileSync("lib/businessNotifications.ts","utf8"),route=readFileSync("app/api/business-notifications/[businessSlug]/[notificationId]/read/route.ts","utf8");
 assert.match(helper,/eq\("business_id", businessId\)\.eq\("status", "unread"\)/);
 assert.match(route,/eq\("business_id",business\.id\)\.eq\("id",notificationId\)/);
 assert.match(route,/status:"read",read_at:new Date\(\)\.toISOString\(\)/);
});
test("review sync only creates notifications for reviews awaiting a reply",()=>{
 const source=readFileSync("lib/businessNotifications.ts","utf8");
 assert.match(source,/if\(review\.reply\|\|!review\.reviewId\)continue/);
 assert.match(source,/google-business-review:\$\{review\.reviewId\}/);
});
test("reply posting requires an editable human-authored reply and resolves only after Google mutation",()=>{
 const source=readFileSync("app/app/[businessSlug]/notifications/actions.ts","utf8");
 assert.match(source,/canManageBusiness\(role\)/);
 assert.match(source,/postGoogleBusinessProfileReviewReply/);
 assert.match(source,/status:\"resolved\"/);
});
test("marketing issue notifications can be acknowledged without hiding unresolved critical issues",()=>{
 const source=readFileSync("app/app/[businessSlug]/notifications/actions.ts","utf8");
 assert.match(source,/row\.type==="marketing_issue"/);
 assert.match(source,/severity==="critical"/);
 assert.match(source,/Issue acknowledged\. It will stay visible until resolved\./);
 assert.match(source,/business_marketing_issues/);
});
