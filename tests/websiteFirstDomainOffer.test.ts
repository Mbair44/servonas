import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website-first pilot offers a manually fulfilled first-year domain",async()=>{
 const [choice,action,config]=await Promise.all([read("components/WebsiteFirstDomainChoice.tsx"),read("app/onboarding/actions.ts"),read("lib/websiteFirstConfig.ts")]);
 assert.match(choice,/I want Servonas to get my domain/);
 assert.match(choice,/confirm availability before registering/);
 assert.match(choice,/Premium domains are not included/);
 assert.match(action,/domain_request_status:"availability_check_needed"/);
 assert.match(action,/requested_domain:domainName/);
 assert.match(config,/pilotDomainIncluded:true/);
});

test("domain requests remain separate from registered custom domains",async()=>{
 const migration=await read("supabase/migrations/20260813000200_website_first_domain_requests.sql");
 assert.match(migration,/requested_domain text/);
 assert.match(migration,/availability_check_needed/);
 assert.match(migration,/not a registered custom domain/);
 assert.doesNotMatch(migration,/business_website_settings.+custom_domain/s);
});

test("publish success and internal admin expose pending requests",async()=>{
 const [success,admin]=await Promise.all([read("app/app/[businessSlug]/settings/website/success/page.tsx"),read("app/app/admin/domains/page.tsx")]);
 assert.match(success,/Your custom domain/);
 assert.match(success,/confirming availability/);
 assert.match(admin,/isServonasPlatformAdmin/);
 assert.match(admin,/Availability not guaranteed/);
});

test("both website-first landing pages disclose offer terms",async()=>{
 for(const path of["app/pest-control-website/page.tsx","app/car-detailing-website/page.tsx"]){const page=await read(path);assert.match(page,/First-year domain included/);assert.match(page,/Premium domains are not included/);assert.match(page,/renewal after the first year/i);}
});
