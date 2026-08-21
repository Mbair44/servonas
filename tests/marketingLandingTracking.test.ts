import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("shared marketing landing attribution wrapper initializes landing and builder tracking",async()=>{
 const component=await read("components/MarketingLandingAttribution.tsx");
 assert.match(component,/AcquisitionFunnelTracker/);
 assert.match(component,/marketing_landing_view/);
 assert.match(component,/AcquisitionBuilderLinkTracker/);
});

test("all paid-traffic industry landing pages use shared landing attribution",async()=>{
 const [shared,car,pest,hvac,plumbing,landscaping,cleaning,powerwashing,floral]=await Promise.all([
  read("components/WebsiteIndustryLanding.tsx"),
  read("app/car-detailing-website/page.tsx"),
  read("app/pest-control-website/page.tsx"),
  read("app/hvac-website/page.tsx"),
  read("app/plumbing-website/page.tsx"),
  read("app/landscaping-website/page.tsx"),
  read("app/cleaning-website/page.tsx"),
  read("app/powerwashing-website/page.tsx"),
  read("app/floral-event-website/page.tsx"),
 ]);
 assert.match(shared,/MarketingLandingAttribution/);
 assert.match(car,/MarketingLandingAttribution source="car-detailing-website"/);
 assert.match(pest,/MarketingLandingAttribution source="pest-control-website"/);
 assert.match(hvac,/WebsiteIndustryLanding/);
 assert.match(plumbing,/WebsiteIndustryLanding/);
 assert.match(landscaping,/WebsiteIndustryLanding/);
 assert.match(cleaning,/WebsiteIndustryLanding/);
 assert.match(powerwashing,/WebsiteIndustryLanding/);
 assert.match(floral,/WebsiteIndustryLanding/);
});

test("car-detailing and pest-control builder CTAs emit builder-start tracking",async()=>{
 const [car,pest]=await Promise.all([
  read("app/car-detailing-website/page.tsx"),
  read("app/pest-control-website/page.tsx"),
 ]);
 assert.match(car,/data-acquisition-builder/);
 assert.match(pest,/data-acquisition-builder/);
});

test("header start-free CTA preserves website-builder source on industry landing pages",async()=>{
 const [layout,header,config]=await Promise.all([
  read("app/layout.tsx"),
  read("components/HeaderSignupLink.tsx"),
  read("lib/websiteFirstConfig.ts"),
 ]);
 assert.match(layout,/HeaderSignupLink/);
 assert.match(header,/websiteFirstPaths/);
 assert.match(header,/websiteFirstSources/);
 assert.match(header,/source=|URLSearchParams\(\{source\}\)/);
 for(const source of ["pest-control-website","car-detailing-website","hvac-website","plumbing-website","landscaping-website","cleaning-website","powerwashing-website","floral-event-website"])assert.match(config,new RegExp(source));
});
