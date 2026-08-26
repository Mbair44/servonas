import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("campaign signup source survives signup and selects website-first onboarding",async()=>{
 const [landing,detailingLanding,signup,auth,onboarding]=await Promise.all([read("app/pest-control-website/page.tsx"),read("app/car-detailing-website/page.tsx"),read("app/signup/page.tsx"),read("app/auth/actions.ts"),read("app/onboarding/page.tsx")]);
 assert.match(landing,/source:\s*"pest-control-website"/);
 assert.match(detailingLanding,/route\("\/onboarding",params,true\)/);
 assert.match(signup,/source=\{query\.source\}/);
 assert.match(auth,/acquisition_source:source/);
 assert.match(auth,/onboarding\?source=\$\{source\}/);
 assert.match(onboarding,/getWebsiteFirstConfig\(user\.user_metadata\?\.acquisition_source\)/);
});

test("website-first workspace writes canonical pest business, services, website and territory records",async()=>{
 const migration=await read("supabase/migrations/20260813000100_website_first_onboarding.sql");
 assert.match(migration,/create or replace function public\.create_website_first_workspace/);
 assert.match(migration,/insert into public\.businesses/);
 assert.match(migration,/business_members/);
 assert.match(migration,/business_website_settings/);
 assert.match(migration,/insert into public\.services/);
 assert.match(migration,/insert into public\.workforce_territories/);
 assert.match(migration,/then 'other' else 'pest_control' end/);
 assert.match(migration,/'appointment_service'/);
 assert.match(migration,/array\['welcome','company','profile'\]/);
});

test("website-first onboarding uses real templates and keeps launch inside the 3-step flow",async()=>{
 const [style,preview,panel,actions]=await Promise.all([read("components/WebsiteFirstStyle.tsx"),read("components/WebsiteFirstPreview.tsx"),read("components/WebsiteFirstLaunchDomainPanel.tsx"),read("app/onboarding/actions.ts")]);
 for(const template of ["modern","bold","traditional"])assert.match(style,new RegExp(`\\[\"${template}\"`));
 assert.match(style,/name="logo"/);
 assert.match(actions,/booking-branding/);
 assert.match(preview,/settings\/website/);
 assert.match(preview,/Preview \/ Launch/);
 assert.match(preview,/const accountEmail=user\.email\?\?business\.email\?\?"";/);
 assert.match(preview,/&email=\$\{encodeURIComponent\(accountEmail\)\}/);
 assert.match(panel,/Publish My Website/);
 assert.match(preview,/Get a custom domain/);
 assert.match(preview,/Customize website/i);
 assert.doesNotMatch(preview,/finishWebsiteFirstOnboarding/);
});

test("website-first onboarding loads business contact details for the preview account gate",async()=>{
 const onboarding=await read("app/onboarding/page.tsx");
 assert.match(onboarding,/select\("id,name,display_name,slug,timezone,email,phone,address_line1,address_line2,city,state,postal_code"\)/);
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
 assert.match(migration,/drop policy if exists "members read website onboarding"/);
 assert.match(migration,/drop policy if exists "admins manage website onboarding"/);
 assert.match(migration,/drop constraint if exists business_website_onboarding_states_source_check/);
});
test("website setup captures pilot domain requests without connecting or purchasing them",async()=>{const [launchPanel,component,actions,migration]=await Promise.all([read("components/WebsiteFirstLaunchDomainPanel.tsx"),read("components/WebsiteFirstDomainChoice.tsx"),read("app/onboarding/actions.ts"),read("supabase/migrations/20260813000200_website_first_domain_requests.sql")]);assert.match(launchPanel,/Get a new \.com/);assert.match(launchPanel,/I already own a domain/);assert.match(launchPanel,/Keep my Servonas address/);assert.match(component,/Get me a new domain/);assert.match(component,/Included/);assert.match(component,/I already own a domain/);assert.match(component,/choice===\"existing_domain\"/);assert.match(component,/servonas\.com\/sites\/\{slug\}/);assert.match(component,/Check now/);assert.match(actions,/normalizeWebsiteDomain/);assert.match(actions,/availability_check_needed/);assert.match(migration,/requested_domain/);assert.match(migration,/domain_request_status/);assert.doesNotMatch(actions,/app\/onboarding\/actions\.ts.+addVercelProjectDomain|app\/onboarding\/actions\.ts.+purchase/s);});

test("website-first workspaces stay in a focused setup shell until completion",async()=>{const [layout,page,wizard]=await Promise.all([read("app/app/[businessSlug]/layout.tsx"),read("app/app/[businessSlug]/settings/website/page.tsx"),read("components/WebsiteSetupWizard.tsx")]);assert.match(layout,/business_website_onboarding_states/);assert.match(layout,/onboarding\.current_step!=="completed"/);assert.match(layout,/WebsiteFirstWorkspaceNav/);assert.match(page,/editable&&!websiteFirstActive/);assert.match(page,/Publish My Website/);assert.match(wizard,/active==="review"/);assert.match(wizard,/publishControl/);});

test("publishing a website-first site returns to the launch flow and supports a live celebration state",async()=>{const [actions,preview,onboarding]=await Promise.all([read("app/app/[businessSlug]/settings/website/actions.ts"),read("components/WebsiteFirstPreview.tsx"),read("app/onboarding/page.tsx")]);assert.match(actions,/websiteFirstTarget/);assert.match(actions,/mode:"preview"\|"domain"\|"live"/);assert.match(actions,/returnFlow/);assert.match(actions,/current_step:"completed"/);assert.match(preview,/Your website is live/);assert.match(preview,/View My Website/);assert.match(preview,/WebsiteLaunchPlayground/);assert.match(onboarding,/websiteMode/);});

test("post-publish recommendations prioritize booking pricing payments and texting",async()=>{const success=await read("app/app/[businessSlug]/settings/website/success/page.tsx");assert.match(success,/Set Up Online Booking/);assert.match(success,/Add Services & Pricing/);assert.match(success,/Connect Payments/);assert.match(success,/Set Up Customer Texting/);assert.match(success,/settings\/communications#inbound-sms/);assert.doesNotMatch(success,/Invite your team/);assert.match(success,/completeWebsiteFirstAndExplore/);});

test("website-first services use one accessible reusable selection grid",async()=>{const [business,grid,config,actions]=await Promise.all([read("components/WebsiteFirstOnboarding.tsx"),read("components/WebsiteFirstServiceGrid.tsx"),read("lib/websiteFirstConfig.ts"),read("app/onboarding/actions.ts")]);assert.match(business,/WebsiteFirstServiceGrid/);assert.match(business,/What services do you offer/);assert.match(grid,/type="checkbox"/);assert.match(grid,/name="services"/);assert.match(grid,/Select all/);assert.match(grid,/Clear all/);assert.match(grid,/option\.other\?"Other"/);for(const service of ["Interior Detail","Exterior Detail","Full Detail","General Pest Control","Termite Control"])assert.match(config,new RegExp(service));assert.match(actions,/selectedServices:services/);});
test("website-first required indicators stay with their labels and state uses a select",async()=>{const [component,styles]=await Promise.all([read("components/WebsiteFirstOnboarding.tsx"),read("app/globals.css")]);assert.match(component,/website-field-title/);assert.match(component,/<select required name="state"/);assert.match(component,/Select a state/);assert.match(component,/\["AZ","Arizona"\]/);assert.doesNotMatch(component,/<input required name="state"/);assert.match(styles,/\.website-field-title\{display:inline-flex/);});
