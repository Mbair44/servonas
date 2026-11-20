import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),"utf8");

test("early-access route collects consent and is not indexed",async()=>{
 const [page,form]=await Promise.all([read("app/early-access/page.tsx"),read("app/early-access/EarlyAccessForm.tsx")]);
 assert.match(page,/index:false/);assert.match(page,/does not guarantee immediate access/);assert.match(form,/name="consent"/);assert.match(form,/InflatableOffice/);assert.match(form,/I don&apos;t use software yet/);
});
test("public lead API only persists approved fields and keeps persistence ahead of notification",async()=>{
 const route=await read("app/api/early-access/route.ts");
 assert.match(route,/parseEarlyAccessLead/);assert.match(route,/platform_early_access_leads/);assert.match(route,/platform_early_access_submission_limits/);assert.match(route,/consent_version/);assert.match(route,/RESEND_API_KEY/);assert.match(route,/if\(persisted\.error\)/);assert.doesNotMatch(route,/status:\s*body\.|internal_notes:\s*body\./);
});
test("lead migration denies public access and scopes read-write access to platform admins",async()=>{
 const migration=await read("supabase/migrations/20261120000100_platform_early_access_leads.sql");
 assert.match(migration,/enable row level security/);assert.match(migration,/revoke all on table public\.platform_early_access_leads from anon,authenticated/);assert.match(migration,/is_servonas_platform_admin\(\)/);assert.match(migration,/platform_early_access_submission_limits/);
});
test("marketing early-access CTAs no longer use the contact interest route",async()=>{
 const [home,header,pricing]=await Promise.all([read("app/page.tsx"),read("components/HeaderSignupLink.tsx"),read("app/pricing/page.tsx")]);
 for(const source of [home,header,pricing]){assert.match(source,/\/early-access/);assert.doesNotMatch(source,/\/contact\?interest=early-access/);}
});
