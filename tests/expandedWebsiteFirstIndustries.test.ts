import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const industries=["hvac","plumbing","landscaping","cleaning"] as const;

test("four new industry landing pages preserve attribution and enter shared website-first signup",async()=>{
 const config=await read("lib/websiteFirstConfig.ts");
 for(const industry of industries){
  const page=await read(`app/${industry}-website/page.tsx`);
  assert.match(page,new RegExp(`source:\"${industry}-website\"`));
  assert.match(page,/WebsiteIndustryLanding/);
  assert.match(page,/demoPath/);
  assert.match(config,new RegExp(`\"${industry}-website\"`));
 }
 const landing=await read("components/WebsiteIndustryLanding.tsx");
 for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"])assert.match(landing,new RegExp(key));
 assert.match(landing,/First-year domain included/);
 assert.match(landing,/Premium domains are not included/);
});

test("new industry demos are fictional and cannot submit customer data",async()=>{
 const demo=await read("components/WebsiteIndustryDemo.tsx");
 assert.match(demo,/fictional example website/);
 assert.match(demo,/example\.invalid/);
 assert.match(demo,/requestEnabled:false/);
 assert.match(demo,/bookingEnabled:false/);
 for(const industry of industries)assert.match(await read(`app/demo/${industry}/page.tsx`),/WebsiteIndustryDemo/);
});

test("migration safely expands sources and maps canonical business profiles",async()=>{
 const sql=await read("supabase/migrations/20260813000800_expand_website_first_industries.sql");
 for(const source of ["hvac-website","plumbing-website","landscaping-website","cleaning-website"])assert.match(sql,new RegExp(source));
 for(const profile of ["'hvac'","'plumbing'","'lawn_care'"])assert.match(sql,new RegExp(profile));
 assert.match(sql,/'other','cleaning'/);
 assert.match(sql,/create or replace function public\.create_website_first_workspace/);
 assert.match(sql,/business_website_settings/);
 assert.match(sql,/public\.services/);
});

test("generated sites recognize each new website source",async()=>{
 const site=await read("components/BusinessWebsite.tsx");
 for(const source of ["hvac-website","plumbing-website","landscaping-website","cleaning-website"])assert.match(site,new RegExp(source));
 assert.match(site,/industryPresentation/);
});

test("HVAC and plumbing demos include industry-specific photography",async()=>{
 const hvac=await read("app/demo/hvac/page.tsx");
 const plumbing=await read("app/demo/plumbing/page.tsx");
 assert.match(hvac,/\/images\/hvac-technician-servicing-ac\.png/);
 assert.match(plumbing,/\/images\/plumbing-professional-at-work\.png/);
});

test("floral and event design has a complete website-first landing and demo flow",async()=>{
 const config=await read("lib/websiteFirstConfig.ts");
 const landing=await read("app/floral-event-website/page.tsx");
 const demo=await read("app/demo/floral-event/page.tsx");
 const site=await read("components/BusinessWebsite.tsx");
 const sql=await read("supabase/migrations/20260814000100_add_floral_event_website_first_industry.sql");
 for(const source of [config,landing,demo,site,sql])assert.match(source,/floral-event-website/);
 assert.match(landing,/WebsiteIndustryLanding/);
 assert.match(landing,/\/demo\/floral-event/);
 assert.match(demo,/WebsiteIndustryDemo/);
 assert.match(demo,/\/images\/floral-event-designer-at-work\.png/);
 assert.match(site,/Request a Consultation/);
 assert.match(sql,/'other','floral_event'/);
 assert.match(sql,/create or replace function public\.create_website_first_workspace/);
});
