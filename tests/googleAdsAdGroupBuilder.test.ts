import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("guided ad group builder replaces the legacy technical form",async()=>{
 const page=await read("app/app/[businessSlug]/marketing/google-ads/page.tsx");
 assert.match(page,/What do you want to advertise\?/);
 assert.match(page,/Build my ad/);
 assert.match(page,/Searches to target/);
 assert.match(page,/Searches Servonas will avoid/);
 assert.match(page,/Ad preview/);
 assert.match(page,/Advanced options/);
 assert.match(page,/Create Ad Group/);
 assert.doesNotMatch(page,/Primary ad headlines|Optional second ad|Christmas Light Installation|Dedicated page and tighter service-specific copy/);
});

test("preparation is tenant scoped, category grounded, and draft only",async()=>{
 const actions=await read("app/app/[businessSlug]/marketing/google-ads/actions.ts");
 assert.match(actions,/export async function prepareGoogleAdsAdGroupAction/);
 assert.match(actions,/eq\("business_id",business\.id\)\.eq\("category_id",id\)/);
 assert.match(actions,/categoryItems/);
 assert.match(actions,/status:"draft"/);
 assert.match(actions,/Nothing has been published yet/);
 assert.match(actions,/existingKeywords/);
 assert.match(actions,/campaign\.negative_keywords/);
 assert.match(actions,/priorDraft/);
 assert.match(actions,/draftAdGroupId/);
});

test("canonical landing pages prefer a connected custom domain",async()=>{
 const service=await read("lib/googleAdsManagement.ts");
 assert.match(service,/const publicRoot = customDomain \|\| siteRoot/);
 assert.match(service,/input\.dedicatedPage\?\.published/);
 assert.match(service,/response_format:\{type:"json_schema"/);
 assert.match(service,/validateGoogleAdsAdGroupSuggestions/);
 assert.match(service,/crossIndustry/);
 assert.match(service,/unsupportedLocation/);
 assert.match(service,/claims=/);
 assert.match(service,/suggestions\.headlines\.length>=3/);
 assert.match(service,/suggestions\.descriptions\.length>=2/);
});

test("Google creation validates RSA assets and requires explicit review submission",async()=>{
 const actions=await read("app/app/[businessSlug]/marketing/google-ads/actions.ts");
 const prepare=actions.indexOf("export async function prepareGoogleAdsAdGroupAction");
 const create=actions.indexOf("export async function createGoogleAdsAdGroupAction");
 assert.ok(create>=0&&prepare>create);
 assert.match(actions,/headlines\.length<3\|\|ads\[0\]\.descriptions\.length<2/);
 assert.match(actions,/eq\("id",draftAdGroupId\).*eq\("business_id",business\.id\).*eq\("campaign_id",campaignId\).*eq\("status","draft"\)/);
});

test("existing ad groups can be edited locally or in Google after validation",async()=>{
 const [page,actions,service]=await Promise.all([read("app/app/[businessSlug]/marketing/google-ads/page.tsx"),read("app/app/[businessSlug]/marketing/google-ads/actions.ts"),read("lib/googleAdsManagement.ts")]);
 assert.match(page,/>Edit ad group</);
 assert.match(page,/Save ad group changes/);
 assert.match(page,/updateGoogleAdsAdGroupAction\.bind\(null,businessSlug,campaign\.id,adGroup\.id\)/);
 assert.match(actions,/export async function updateGoogleAdsAdGroupAction/);
 assert.match(actions,/eq\("business_id",business\.id\)\.eq\("campaign_id",campaignId\)\.eq\("id",adGroupId\)/);
 assert.match(actions,/fetchGoogleAdsCampaignAdGroupDetails/);
 assert.match(actions,/updateGoogleAdsManagedAdGroup/);
 assert.match(service,/export async function updateGoogleAdsManagedAdGroup/);
 assert.match(service,/validateOnly:true/);
 assert.match(service,/adGroupCriterionOperation:\{remove/);
 assert.match(service,/adGroupAdOperation:\{remove/);
});

test("each Manual CPC ad group exposes a recommended bid and verifies updates in Google",async()=>{
 const [page,actions,service,migration]=await Promise.all([read("app/app/[businessSlug]/marketing/google-ads/page.tsx"),read("app/app/[businessSlug]/marketing/google-ads/actions.ts"),read("lib/googleAdsManagement.ts"),read("supabase/migrations/20260906000100_google_ads_ad_group_cpc.sql")]);
 assert.match(page,/Servonas suggestion:/);
 assert.match(page,/Update Max CPC/);
 assert.match(page,/updateGoogleAdsAdGroupCpcAction\.bind\(null,businessSlug,campaign\.id,adGroup\.id\)/);
 assert.match(page,/Managed automatically by Google/);
 assert.match(actions,/export async function updateGoogleAdsAdGroupCpcAction/);
 assert.match(actions,/googleAdsBidDollarsToMicros\(text\(formData,"maxCpcDollars"\)\)/);
 assert.match(actions,/updateGoogleAdsAdGroupBid/);
 assert.match(actions,/verified\.cpcBidMicros!==requestedCpcMicros/);
 assert.match(actions,/google_ads_ad_group_cpc_update_completed/);
 assert.match(service,/adGroup\.cpcBidMicros\|\|input\.manualCpcBidMicros/);
 assert.match(migration,/add column if not exists cpc_bid_micros bigint/);
});

test("saving a Servonas-only ad group publishes it instead of silently updating a local draft",async()=>{
 const [page,actions]=await Promise.all([read("app/app/[businessSlug]/marketing/google-ads/page.tsx"),read("app/app/[businessSlug]/marketing/google-ads/actions.ts")]);
 assert.match(page,/publishedInGoogle\?updateGoogleAdsAdGroupAction\.bind\(null,businessSlug,campaign\.id,adGroup\.id\):createGoogleAdsAdGroupAction\.bind\(null,businessSlug,campaign\.id\)/);
 assert.match(page,/!publishedInGoogle&&<input type="hidden" name="draftAdGroupId" value=\{adGroup\.id\}/);
 assert.match(page,/publishedInGoogle\?"Save ad group changes":"Create in Google Ads"/);
 assert.match(page,/Saved in Servonas only/);
 assert.match(page,/Verified in Google Ads/);
 assert.match(actions,/if\(!adGroup\.google_ad_group_id\)\{\s*formData\.set\("draftAdGroupId",adGroupId\);\s*return createGoogleAdsAdGroupAction\(slug,campaignId,formData\);\s*\}/);
});

test("creation reports success only after Google mutation read-back verification",async()=>{
 const [page,actions,service,confirmation]=await Promise.all([read("app/app/[businessSlug]/marketing/google-ads/page.tsx"),read("app/app/[businessSlug]/marketing/google-ads/actions.ts"),read("lib/googleAdsManagement.ts"),read("lib/googleAdsAdGroupCreation.ts")]);
 assert.match(page,/data-loading-label="Creating ad group…"/);
 assert.match(page,/title: query\.success==="Created in Google Ads\."\?"Created in Google Ads"/);
 assert.match(actions,/confirmGoogleAdsAdGroupCreation/);
 assert.match(actions,/verifyGoogleAdsAdGroup/);
 assert.match(actions,/google_ads_ad_group_mutate_response/);
 assert.match(actions,/google_ads_ad_group_verification_completed/);
 assert.match(actions,/google_ads_ad_group_creation_failed/);
 assert.match(actions,/redirect\(path\(slug, "success", "Created in Google Ads\."\)\)/);
 assert.doesNotMatch(actions,/redirect\(path\(slug, "success", "Ad group added\."\)\)/);
 assert.match(service,/export \{confirmGoogleAdsAdGroupCreation/);
 assert.match(confirmation,/Google Ads returned no created ad-group resource/);
});
