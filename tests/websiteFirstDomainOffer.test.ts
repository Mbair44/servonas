import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website-first pilot captures a first-year domain request before registrar fulfillment",async()=>{
 const [choice,action,config]=await Promise.all([read("components/WebsiteFirstDomainChoice.tsx"),read("app/onboarding/actions.ts"),read("lib/websiteFirstConfig.ts")]);
 assert.match(choice,/Get me a new domain/);
 assert.match(choice,/Check now/);
 assert.match(choice,/First year: Free/);
 assert.match(choice,/per year/);
 assert.match(choice,/does not reserve or purchase/);
 assert.match(choice,/premium domain|Premium domains are not included/);
 assert.match(action,/domain_request_status:"availability_check_needed"/);
 assert.match(action,/requested_domain:domainName/);
 assert.match(config,/pilotDomainIncluded:true/);
});

test("website-first availability check is authenticated, priced, and read-only",async()=>{
 const route=await read("app/api/domains/availability/route.ts");
 assert.match(route,/auth\.getUser/);
 assert.match(route,/getVercelDomainQuote/);
 assert.match(route,/renewalPrice/);
 assert.match(route,/vercelStandardDomainMaximumPrice/);
 assert.doesNotMatch(route,/buyVercelDomain|addVercelProjectDomain|\.insert\(|\.update\(|\.upsert\(/);
});

test("domain requests remain separate from registered custom domains",async()=>{
 const [requestsMigration,registrationMigration,fixMigration]=await Promise.all([
  read("supabase/migrations/20260813000200_website_first_domain_requests.sql"),
  read("supabase/migrations/20260813000300_vercel_domain_registration.sql"),
  read("supabase/migrations/20260827000300_fix_managed_domain_status_constraint.sql"),
 ]);
 assert.match(requestsMigration,/requested_domain text/);
 assert.match(requestsMigration,/availability_check_needed/);
 assert.match(requestsMigration,/not a registered custom domain/);
 assert.doesNotMatch(requestsMigration,/business_website_settings.+custom_domain/s);
 assert.match(registrationMigration,/'available'/);
 assert.match(registrationMigration,/'premium_review'/);
 assert.match(registrationMigration,/'registered'/);
 assert.match(fixMigration,/'available'/);
 assert.match(fixMigration,/'premium_review'/);
 assert.match(fixMigration,/'failed'/);
});

test("publish success and internal admin expose pending requests",async()=>{
 const [success,admin]=await Promise.all([read("app/app/[businessSlug]/settings/website/success/page.tsx"),read("app/app/admin/domains/page.tsx")]);
 assert.match(success,/Give your website a professional \.com/);
 assert.match(success,/Finish setting up your domain|Finish registering your domain|Your domain registration is in progress|Your domain needs attention/);
 assert.match(admin,/isServonasPlatformAdmin/);
 assert.match(admin,/Check availability &amp; price/);
 assert.match(admin,/Register this domain through Vercel/);
});

test("both website-first landing pages disclose offer terms",async()=>{
 for(const path of["app/pest-control-website/page.tsx","app/car-detailing-website/page.tsx"]){const page=await read(path);assert.match(page,/First-year domain included/);assert.match(page,/Premium domains are not included/);assert.match(page,/renewal after the first year/i);}
});
