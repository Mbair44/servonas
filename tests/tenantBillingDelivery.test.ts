import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("tenant billing API is workspace-scoped and uses Stripe as its management authority",()=>{
 const route=read("app/api/billing/[businessSlug]/route.ts");
 assert.match(route,/requireWorkspace\(slug/);assert.match(route,/canManageBusiness/);assert.match(route,/stripe\.subscriptions\.retrieve/);
 assert.match(route,/cancel_at_period_end:true/);assert.match(route,/cancel_at_period_end:false/);assert.match(route,/proration_behavior:"create_prorations"/);
});
test("billing settings render the tenant dashboard without changing public pricing",()=>{
 const settings=read("app/app/[businessSlug]/settings/SettingsContent.tsx"),dashboard=read("components/TenantBillingDashboard.tsx");
 assert.match(settings,/TenantBillingDashboard/);assert.match(dashboard,/Eligible payment volume/);assert.match(dashboard,/Manual bookings/);assert.match(dashboard,/Refresh from Stripe/);
});
