import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildLocalSeoReport } from "../lib/localSeo.ts";
import {locationPageSimilarity,locationPageSlug} from "../lib/locationPages.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("builds high-priority service and location recommendations from real business signals", () => {
  const report = buildLocalSeoReport({
    businessName: "Copper State Bounce",
    phone: "+1 480-555-0100",
    websiteBasePath: "https://copperstatebounce.com",
    serviceAreas: ["Gilbert, AZ", "Mesa, AZ"],
    websiteStatus: "published",
    googleBusinessConnected: true,
    googleBusinessLocationTitle: "Copper State Bounce",
    googleBusinessSupportsServices: true,
    services: [
      { id: "svc-1", name: "Water Slide Rentals", bookingCount90d: 18, active: true, price_label: "$299" },
      { id: "svc-2", name: "Bounce House Rentals", bookingCount90d: 2, active: true },
    ],
    locations: [
      { id: "gilbert-az", name: "Gilbert, AZ", jobCount90d: 14, customerCount: 6, reviewCount: 4 },
    ],
    unansweredReviews: [{ reviewId: "rev-1", author: "Sarah M.", rating: 5, text: "The kids loved the water slide!", reply: null, publishedAt: "2026-09-01T00:00:00.000Z" }],
    mappings: [],
    states: [],
    reviewSnippets: [{ author: "Sarah M.", text: "The kids loved the water slide!", locationLabel: "Gilbert, AZ" }],
  });
  assert.ok(report.highPriority.some((item) => item.type === "missing_service_page" && item.entityLabel === "Water Slide Rentals"));
  assert.ok(report.highPriority.some((item) => item.type === "missing_location_page" && item.entityLabel === "Gilbert, AZ"));
  assert.ok(report.recommendations.some((item) => item.type === "unanswered_review"));
  assert.ok(report.recommendations.some((item) => item.type === "missing_google_service"));
});

test("existing published mappings suppress duplicate service and location page recommendations", () => {
  const report = buildLocalSeoReport({
    businessName: "Copper State Bounce",
    phone: null,
    websiteBasePath: "https://example.com",
    serviceAreas: [],
    websiteStatus: "published",
    googleBusinessConnected: false,
    googleBusinessLocationTitle: null,
    googleBusinessSupportsServices: false,
    services: [{ id: "svc-1", name: "Water Slide Rentals", bookingCount90d: 18, active: true }],
    locations: [{ id: "gilbert-az", name: "Gilbert, AZ", jobCount90d: 14, customerCount: 6, reviewCount: 4 }],
    unansweredReviews: [],
    mappings: [
      { source_entity_type: "service", source_entity_id: "svc-1", target_type: "website_service_page", status: "draft" },
      { source_entity_type: "location", source_entity_id: "gilbert-az", target_type: "website_location_page", status: "published" },
    ],
    states: [],
    reviewSnippets: [],
  });
  assert.equal(report.recommendations.some((item) => item.type === "missing_service_page" && item.entityId === "svc-1"), false);
  assert.equal(report.recommendations.some((item) => item.type === "missing_location_page" && item.entityId === "gilbert-az"), false);
});

test("a location draft remains actionable until it is published",()=>{
 const base={businessName:"Example Co",phone:null,websiteBasePath:"https://example.com",serviceAreas:["Gilbert, AZ"],websiteStatus:"published" as const,googleBusinessConnected:true,googleBusinessLocationTitle:"Example Co",googleBusinessSupportsServices:false,services:[],locations:[{id:"Gilbert, AZ",name:"Gilbert, AZ",jobCount90d:8,customerCount:4,reviewCount:0}],unansweredReviews:[],states:[],reviewSnippets:[]};
 const draft=buildLocalSeoReport({...base,mappings:[{source_entity_type:"location",source_entity_id:"Gilbert, AZ",target_type:"website_location_page",status:"draft"}]});
 const published=buildLocalSeoReport({...base,mappings:[{source_entity_type:"location",source_entity_id:"Gilbert, AZ",target_type:"website_location_page",status:"published"}]});
 assert.ok(draft.recommendations.some(item=>item.type==="missing_location_page"));
 assert.equal(published.recommendations.some(item=>item.type==="missing_location_page"),false);
});

test("location page helpers create stable slugs and detect thin duplicate copy",()=>{
 assert.equal(locationPageSlug("Gilbert","AZ","Bounce House Rentals"),"gilbert-az-bounce-house-rentals");
 assert.ok(locationPageSimilarity("Bounce house rentals for Gilbert families and school events","Bounce house rentals for Gilbert families and church events")>.5);
 assert.ok(locationPageSimilarity("Water slides for summer parties","Drain cleaning and water heater repair")<.2);
});

test("local seo page and navigation expose the new action center", async () => {
  const [page, nav, migration] = await Promise.all([
    read("app/app/[businessSlug]/marketing/seo/page.tsx"),
    read("lib/workspaceNavigation.ts"),
    read("supabase/migrations/20260904000200_local_seo_foundation.sql"),
  ]);
  assert.match(page, /<h1>Local SEO<\/h1>/);
  assert.match(page, /Servonas SEO Score/);
  assert.match(page, /Create page draft/);
  assert.match(page, /Build \$\{city\} Page/);
  assert.match(page, /notification center/);
  assert.match(nav, /label:"Local SEO",href:`\$\{base\}\/marketing\/seo`/);
  assert.match(migration, /create table if not exists public\.business_local_seo_recommendation_states/);
  assert.match(migration, /create table if not exists public\.business_seo_entity_mappings/);
});

test("location pages have a reusable lifecycle, editor, public rendering, and sitemap",async()=>{
 const [migration,actions,editor,submit,landing,domainRoute,slugRoute,sitemap]=await Promise.all([read("supabase/migrations/20260908000200_business_location_pages.sql"),read("app/app/[businessSlug]/marketing/seo/actions.ts"),read("components/LocationPageEditor.tsx"),read("components/LocationPageSubmit.tsx"),read("components/LocationLanding.tsx"),read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/sitemap.xml/route.ts")]);
 assert.match(migration,/business_location_pages/);assert.match(migration,/draft','published','archived/);
 assert.match(actions,/generateLocationPage/);assert.match(actions,/publishLocationPage/);assert.match(actions,/status:"published"/);
 assert.match(editor,/SEO details/);assert.match(editor,/Saving…/);assert.match(submit,/useFormStatus/);assert.match(landing,/application\/ld\+json/);assert.match(landing,/Nearby areas we serve/);
 assert.match(domainRoute,/LocationLanding/);assert.match(slugRoute,/LocationLanding/);assert.match(sitemap,/business_location_pages/);
});

test("location page build preflights required storage before calling AI and reports persistence failures",async()=>{
 const actions=await read("app/app/[businessSlug]/marketing/seo/actions.ts");
 const preflight=actions.indexOf('"preflight_location_page_storage"'),generation=actions.indexOf("generateLocationPage({source"),persistence=actions.indexOf('operationName:"persist_location_page_draft"');
 assert.ok(preflight>=0&&generation>preflight&&persistence>generation);
 assert.match(actions,/We couldn't build this page yet\. Please try again\./);
 assert.match(actions,/location_page_persistence_failed/);
 assert.match(actions,/isNextRedirect\(error\)\)throw error/);
});

test("location page build logs optional lookup failures without retrying or aborting generation",async()=>{
 const actions=await read("app/app/[businessSlug]/marketing/seo/actions.ts");
 assert.match(actions,/load_website_snapshot","business_website_settings",false/);
 assert.match(actions,/load_inventory","inventory_items",false/);
 assert.match(actions,/load_recent_location_bookings","bookings",false/);
 assert.match(actions,/local_seo_downstream_failed/);
 assert.doesNotMatch(actions,/retryLocation|retry.*databaseOperation/);
});

test("local SEO renders from persisted review data instead of calling Google on page load",async()=>{
 const page=await read("app/app/[businessSlug]/marketing/seo/page.tsx");
 assert.match(page,/website\?\.google_reviews/);
 assert.doesNotMatch(page,/getGoogleBusinessProfileReviews/);
});

test("failed OpenAI location generation is sanitized and does not return content",async()=>{
 const previousKey=process.env.OPENAI_API_KEY,originalFetch=globalThis.fetch;
 process.env.OPENAI_API_KEY="test-key";
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{type:"invalid_request_error",code:"bad_request",message:"Malformed request"}}),{status:400,headers:{"content-type":"application/json"}});
 const source={business:{name:"Example Co",industry:"party_rental",description:null,phone:null,email:null,city:"Mesa",state:"AZ"},location:{name:"Gilbert, AZ",city:"Gilbert",state:"AZ",jobCount90d:1,customerCount:1,reviewCount:0},website:{baseUrl:"https://example.com",heroHeading:null,heroSubheading:null,aboutText:null,bookingEnabled:true,requestEnabled:true},serviceAreas:["Gilbert, AZ"],services:[{name:"Bounce House Rentals",description:null}],inventory:[],hours:[],reviews:[],policies:[]};
 try{await assert.rejects(()=>import("../lib/locationPages.ts").then(({generateLocationPage})=>generateLocationPage({source,existingPages:[]})),/could not generate the location page right now/);}finally{globalThis.fetch=originalFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
});
