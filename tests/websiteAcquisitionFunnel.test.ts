import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("website acquisition funnel has the required prospect milestones",async()=>{
 const library=await read("lib/acquisitionFunnel.ts");
 for(const event of ["marketing_landing_view","website_builder_started","website_builder_step1_started","website_builder_step1_completed","website_builder_style_viewed","website_builder_style_selected","website_preview_generated","website_preview_viewed","business_created","website_published"])assert.match(library,new RegExp(`\\"${event}\\"`));
});
test("marketing landing and builder tracking are client-side, while milestones remain linked server-side",async()=>{
 const [landing,tracker,onboarding,style,onboardingActions,publish,route]=await Promise.all([read("components/WebsiteIndustryLanding.tsx"),read("components/AcquisitionFunnelTracker.tsx"),read("components/WebsiteFirstOnboarding.tsx"),read("components/WebsiteFirstStyle.tsx"),read("app/onboarding/actions.ts"),read("app/app/[businessSlug]/settings/website/actions.ts"),read("app/api/marketing/acquisition/route.ts")]);
 assert.match(landing,/MarketingLandingAttribution/);assert.match(tracker,/trackAcquisition\(industry,event,metadata\)/);assert.match(tracker,/website_builder_started/);assert.match(onboarding,/website_builder_step1_started/);assert.match(onboardingActions,/website_builder_step1_completed/);assert.match(style,/website_builder_style_viewed/);assert.match(onboardingActions,/website_preview_generated/);assert.match(publish,/website_published/);assert.match(route,/prefetch/i);assert.match(route,/bots/);
});

test("acquisition sessions are scoped to each industry landing funnel",async()=>{
 const [tracker,onboarding,auth]=await Promise.all([read("components/AcquisitionFunnelTracker.tsx"),read("components/WebsiteFirstOnboarding.tsx"),read("components/AuthForm.tsx")]);
 assert.match(tracker,/const storageKey=\(industry:string\)=>`servonas\.website-acquisition\.\$\{industry\}`;/);
 assert.match(tracker,/const state=\(industry:string\):Stored/);
 assert.match(tracker,/state\(industry\)/);
 assert.match(onboarding,/acquisitionSessionId\(source\)/);
 assert.match(auth,/acquisitionSessionId\(source\)/);
});
