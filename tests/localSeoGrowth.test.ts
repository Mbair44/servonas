import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {buildLocalGrowthPlan} from "../lib/localSeoGrowth.ts";

const base={businessSlug:"copper-state-bounce",city:"Gilbert",pageUrl:"https://copperstatebounce.com/gilbert-az-bounce-house-rentals",pageLive:true,metadataReady:true,sitemapReady:true,internallyLinked:true,serviceAreaSupported:true,googleBusinessConnected:false,googleAdsStatus:"disconnected" as const,locationPromotionExists:false,trackingReady:true};

test("published location pages recommend Google Business Profile first",()=>{
 const plan=buildLocalGrowthPlan(base);
 assert.equal(plan.primary?.id,"google_business");
 assert.equal(plan.primary?.actionLabel,"Connect Google Business Profile");
 assert.equal(plan.steps.find(step=>step.id==="google_discovery")?.status,"complete");
});

test("the next action advances from discovery to a city promotion",()=>{
 const discovery=buildLocalGrowthPlan({...base,googleBusinessConnected:true,metadataReady:false});
 assert.equal(discovery.primary?.id,"google_discovery");
 const promotion=buildLocalGrowthPlan({...base,googleBusinessConnected:true,googleAdsStatus:"connected"});
 assert.equal(promotion.primary?.id,"google_ads");
 assert.match(promotion.primary?.actionHref??"",/promoteCity=Gilbert/);
 assert.match(promotion.primary?.actionHref??"",/landingPage=https%3A%2F%2Fcopperstatebounce\.com/);
});

test("incomplete Google Ads setup is distinct from a disconnected account",()=>{
 const plan=buildLocalGrowthPlan({...base,googleBusinessConnected:true,googleAdsStatus:"setup_incomplete"});
 assert.equal(plan.primary?.title,"Finish Google Ads setup");
 assert.match(plan.primary?.actionHref??"",/returnTo=/);
});

test("unsupported service areas block promotion recommendations",()=>{
 const plan=buildLocalGrowthPlan({...base,serviceAreaSupported:false,googleBusinessConnected:true,googleAdsStatus:"connected"});
 assert.equal(plan.primary,null);
 assert.match(plan.serviceAreaWarning??"",/not in this business's configured service area/);
});

test("Local SEO hands city context to the existing tenant-safe Google Ads builder",async()=>{
 const [seoPage,adsPage,actions,website,sitemap]=await Promise.all([
  readFile(new URL("../app/app/[businessSlug]/marketing/seo/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/app/[businessSlug]/marketing/google-ads/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/app/[businessSlug]/marketing/google-ads/actions.ts",import.meta.url),"utf8"),
  readFile(new URL("../components/BusinessWebsite.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/sitemap.xml/route.ts",import.meta.url),"utf8"),
 ]);
 assert.match(seoPage,/buildLocalGrowthPlan/);
 assert.match(seoPage,/report\.recommendations\.filter\(item=>item\.type==="missing_location_page"/);
 assert.match(adsPage,/promotionLandingPage/);
 assert.match(actions,/citySupported/);
 assert.match(actions,/candidate\.origin===root\.origin/);
 assert.match(website,/business-site-areas/);
 assert.match(sitemap,/business_location_pages/);
});

test("manual locations validate duplicates and reuse the existing page builder",async()=>{
 const actions=await readFile(new URL("../app/app/[businessSlug]/marketing/seo/actions.ts",import.meta.url),"utf8");
 assert.match(actions,/export async function addLocalSeoLocation/);
 assert.match(actions,/existingByKey/);
 assert.match(actions,/addToServiceArea/);
 assert.match(actions,/await buildLocationPage\(slug,resolved\.key/);
});
