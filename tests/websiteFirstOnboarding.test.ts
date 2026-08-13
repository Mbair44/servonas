import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("campaign signup source survives signup and selects website-first onboarding",async()=>{
 const [landing,signup,auth,onboarding]=await Promise.all([read("app/pest-control-website/page.tsx"),read("app/signup/page.tsx"),read("app/auth/actions.ts"),read("app/onboarding/page.tsx")]);
 assert.match(landing,/source:\s*"pest-control-website"/);
 assert.match(signup,/source=\{query\.source\}/);
 assert.match(auth,/acquisition_source:source/);
 assert.match(auth,/onboarding\?source=pest-control-website/);
 assert.match(onboarding,/user\.user_metadata\?\.acquisition_source===\"pest-control-website\"/);
});

test("website-first workspace writes canonical pest business, services, website and territory records",async()=>{
 const migration=await read("supabase/migrations/20260813000100_website_first_onboarding.sql");
 assert.match(migration,/create or replace function public\.create_website_first_workspace/);
 assert.match(migration,/insert into public\.businesses/);
 assert.match(migration,/business_members/);
 assert.match(migration,/business_website_settings/);
 assert.match(migration,/insert into public\.services/);
 assert.match(migration,/insert into public\.workforce_territories/);
 assert.match(migration,/'pest_control','appointment_service'/);
 assert.match(migration,/array\['welcome','company','profile'\]/);
});

test("website-first onboarding uses real templates and continues into normal setup",async()=>{
 const [style,preview,actions]=await Promise.all([read("components/WebsiteFirstStyle.tsx"),read("components/WebsiteFirstPreview.tsx"),read("app/onboarding/actions.ts")]);
 for(const template of ["modern","bold","traditional"])assert.match(style,new RegExp(`\\[\"${template}\"`));
 assert.match(style,/name="logo"/);
 assert.match(actions,/booking-branding/);
 assert.match(preview,/settings\/website\/preview/);
 assert.match(preview,/Customize My Website/);
 assert.match(preview,/Continue Setting Up My Business/);
 assert.match(actions,/current_step:\"completed\"/);
});

test("public pest demo is fictional, safe and linked to campaign signup",async()=>{
 const demo=await read("app/demo/pest-control/page.tsx");
 assert.match(demo,/This is an example website built with Servonas/);
 assert.match(demo,/Fictional demonstration business/);
 assert.match(demo,/button type="button"/);
 assert.match(demo,/source:\"pest-control-website\"/);
 assert.doesNotMatch(demo,/type="submit"/);
 assert.doesNotMatch(demo,/fetch\(|form action=/);
});

test("website-first state is tenant scoped with explicit member/admin policies",async()=>{
 const migration=await read("supabase/migrations/20260813000100_website_first_onboarding.sql");
 assert.match(migration,/enable row level security/);
 assert.match(migration,/is_business_member\(business_id\)/);
 assert.match(migration,/has_business_role\(business_id,array\['owner','admin'\]\)/);
 assert.match(migration,/auth\.uid\(\)/);
});
