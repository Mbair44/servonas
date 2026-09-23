import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {attributionFromSearch,validSessionId} from "../lib/bookingFunnel.ts";
import {attachSessionMetricsToSourceReport,automatedTrafficClassification,buildCampaignPerformanceReport,buildSessionDurationBuckets,buildSessionQualityReport,buildSourcePerformanceReport,buildLandingPageFunnelReport,normalizeMarketingSource,normalizeSessionAttribution,resolveMetaAttributionName,sessionEngagementClassification,verificationStatusForSession} from "../lib/marketingAttribution.ts";

test("captures Google click IDs and UTMs without retaining unrelated query values",()=>{
 const values=attributionFromSearch(new URLSearchParams("gclid=click-1&utm_source=google&utm_medium=cpc&utm_campaign=summer&email=private@example.com"));
 assert.deepEqual(values,{gclid:"click-1",utm_source:"google",utm_medium:"cpc",utm_campaign:"summer"});
});

test("captures fbclid alongside other first-touch attribution fields",()=>{
 const values=attributionFromSearch(new URLSearchParams("fbclid=meta-click-1&utm_source=facebook&utm_campaign=fall"));
 assert.deepEqual(values,{fbclid:"meta-click-1",utm_source:"facebook",utm_campaign:"fall"});
});
test("captures a complete Meta landing query from the browser search params",()=>{
 const values=attributionFromSearch(new URLSearchParams("utm_source=facebook&utm_medium=paid_social&utm_campaign=fall_party_special&utm_content=pumpkin_static&utm_term=ad_set&fbclid=meta-click"));
 assert.deepEqual(values,{utm_source:"facebook",utm_medium:"paid_social",utm_campaign:"fall_party_special",utm_content:"pumpkin_static",utm_term:"ad_set",fbclid:"meta-click"});
});
test("preserves Meta click attribution when an embedded booking URL only has it in the referrer",()=>{
 const values=attributionFromSearch(new URLSearchParams("embed=1&checkoutUrl=https%3A%2F%2Fcopperstatebounce.com%2Fbooking%2Fcheckout"),new URLSearchParams("fbclid=meta-click-2&utm_source=fb&utm_medium=paid&utm_campaign=fall"));
 assert.deepEqual(values,{fbclid:"meta-click-2",utm_source:"fb",utm_medium:"paid",utm_campaign:"fall"});
});
test("accepts only UUID anonymous attribution session identifiers",()=>{
 assert.equal(validSessionId("9c95b508-72a0-4e01-9c24-2a86bf1f4eb3"),true);
 assert.equal(validSessionId("other-business-session"),false);
});

test("normalizes preserved first-touch Google Ads attribution",()=>{
 assert.equal(normalizeMarketingSource({gclid:"click-1",utm_source:"facebook",first_referrer:"https://facebook.com"}),"google_ads");
});

test("normalizes fbclid-backed Meta visits even when referrer is missing",()=>{
 assert.equal(normalizeMarketingSource({fbclid:"meta-click-1"}),"facebook");
 assert.equal(normalizeMarketingSource({fbclid:"meta-click-1",utm_source:"instagram"}),"instagram");
 assert.equal(normalizeMarketingSource({utm_source:"fb",utm_medium:"paid"}),"facebook");
});

test("normalizes Meta attribution into human-readable hierarchy fields",()=>{
 const normalized=normalizeSessionAttribution({utm_source:"fb",utm_medium:"paid_social",utm_campaign:"Holiday Leads",utm_term:"Phoenix Ad Set | Carousel Ad",utm_content:"2381 | 4477",utm_id:"9911",fbclid:"meta-click",first_landing_url:"https://example.com/?fbclid=meta-click"});
 assert.equal(normalized.providerLabel,"Meta Ads");
 assert.equal(normalized.platformLabel,"Facebook");
 assert.equal(normalized.channelLabel,"Paid Social");
 assert.equal(normalized.campaignName,"Holiday Leads");
 assert.equal(normalized.campaignId,"9911");
 assert.equal(normalized.adSetName,"Phoenix Ad Set");
 assert.equal(normalized.adName,"Carousel Ad");
});

test("resolves numeric Meta campaign IDs from tenant-synced performance rows",()=>{
 const resolved=resolveMetaAttributionName({utm_source:"facebook",utm_medium:"paid_social",utm_campaign:"120251788722360024"},[
  {campaign_id:"120251788722360024",campaign_name:"CSB – Tiered Fall Discount – Sep 2026",adset_id:null,adset_name:null,ad_id:null,ad_name:null},
 ]);
 assert.deepEqual(resolved,{name:"CSB – Tiered Fall Discount – Sep 2026",rawId:"120251788722360024",level:"campaign"});
});

test("prefers campaign names, preserves friendly UTMs, and falls back when Meta data is unavailable",()=>{
 const rows=[{campaign_id:"campaign-id",campaign_name:"Campaign",adset_id:"120251788722360025",adset_name:"East Valley parents",ad_id:"120251788722360026",ad_name:"Pumpkin static"}];
 assert.deepEqual(resolveMetaAttributionName({utm_source:"ig",utm_medium:"paid_social",utm_term:"120251788722360025"},rows),{name:"East Valley parents",rawId:"120251788722360025",level:"adset"});
 assert.equal(resolveMetaAttributionName({utm_source:"ig",utm_medium:"paid_social",utm_campaign:"pumpkin_static"},rows),null);
 assert.equal(resolveMetaAttributionName({utm_source:"ig",utm_medium:"paid_social",utm_campaign:"120251788722360024"},[]),null);
});

test("session-quality names are resolved only from the supplied tenant Meta rows",()=>{
 const sessions=[{id:"tenant-a",utm_source:"facebook",utm_medium:"paid_social",utm_campaign:"120251788722360024",total_session_duration_milliseconds:1000}];
 const report=buildSessionQualityReport(sessions,{metaPerformanceRows:[{campaign_id:"120251788722360024",campaign_name:"Tenant A campaign",adset_id:null,adset_name:null,ad_id:null,ad_name:null}]});
 assert.equal(report.buckets.find((bucket)=>bucket.key==="one_to_four_seconds")?.details[0]?.metaAttributionName?.name,"Tenant A campaign");
 const noTenantRows=buildSessionQualityReport(sessions,{metaPerformanceRows:[]});
 assert.equal(noTenantRows.buckets.find((bucket)=>bucket.key==="one_to_four_seconds")?.details[0]?.metaAttributionName,null);
});

test("campaign performance combines Meta placements, resolves IDs, and retains unattributed traffic",()=>{
 const sessions=[
  {id:"facebook",utm_source:"facebook",utm_medium:"paid_social",utm_campaign:"120251788722360024"},
  {id:"instagram",utm_source:"instagram",utm_medium:"paid_social",utm_campaign:"120251788722360024"},
  {id:"unknown-meta",utm_source:"facebook",utm_medium:"paid_social"},
  {id:"friendly",utm_source:"facebook",utm_medium:"paid_social",utm_campaign:"link_in_bio"},
 ];
 const rows=buildCampaignPerformanceReport({sessions,events:[
  {event_name:"landing_view",attribution_session_id:"facebook"},{event_name:"booking_started",attribution_session_id:"instagram"},
 ],bookings:[{booking_id:"b1",status:"confirmed",total_cents:11250,booking_attribution_snapshots:{utm_source:"instagram",utm_medium:"paid_social",utm_campaign:"120251788722360024"}}],metaPerformanceRows:[{campaign_id:"120251788722360024",campaign_name:"Fall Discount",adset_id:null,adset_name:null,ad_id:null,ad_name:null}]});
 const campaign=rows.find((row)=>row.name==="Fall Discount");
 assert.equal(campaign?.source,"meta_ads");assert.equal(campaign?.visits,2);assert.equal(campaign?.bookingStarts,1);assert.equal(campaign?.bookings,1);assert.equal(campaign?.revenueCents,11250);
 assert.equal(rows.find((row)=>row.name==="link_in_bio")?.isMetaId,false);
 assert.equal(rows.find((row)=>row.name==="Unattributed")?.visits,1);
});

test("campaign performance uses a tenant's Google campaign name without cross-tenant fallback",()=>{
 const rows=buildCampaignPerformanceReport({sessions:[{id:"google",utm_source:"google",utm_medium:"cpc",utm_campaign:"12345"}],events:[],bookings:[],googleCampaignRows:[{google_campaign_id:"12345",campaign_name:"Gilbert rentals"}]});
 assert.equal(rows[0]?.name,"Gilbert rentals");
 assert.equal(buildCampaignPerformanceReport({sessions:[{id:"other",utm_source:"google",utm_medium:"cpc",utm_campaign:"12345"}],events:[],bookings:[],googleCampaignRows:[]})[0]?.name,"12345");
});

test("builds source funnel counts, revenue, and roas from the existing event stream",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"inventory_view",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"availability_check",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"checkout_started",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s2",event_name:"landing_view",booking_attribution_sessions:{gclid:"click-2"}},
 ],[
  {booking_id:"b1",status:"confirmed",total_cents:32500,booking_attribution_snapshots:{utm_source:"facebook"}},
 ],{facebook:1800,google_ads:8400});
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 const googleAds=report.summaries.find((row)=>row.source==="google_ads");
 assert.ok(facebook);
 assert.equal(facebook.visits,1);
 assert.equal(facebook.engaged,1);
 assert.equal(facebook.bookings,1);
 assert.equal(facebook.detailedCounts.booking_completed,1);
 assert.equal(facebook.revenueCents,32500);
 assert.equal(facebook.roas?.toFixed(1),"18.1");
 assert.ok(googleAds);
 assert.equal(googleAds.visits,1);
});

test("does not count synthetic booking completion events without a persisted booking",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"availability_check",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"checkout_started",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"booking_completed",booking_id:"phantom",booking_total_cents:null,booking_attribution_sessions:{gclid:"click-1"}},
 ]);
 const googleAds=report.summaries.find((row)=>row.source==="google_ads");
 assert.ok(googleAds);
 assert.equal(googleAds.visits,1);
 assert.equal(googleAds.detailedCounts.availability_check,1);
 assert.equal(googleAds.bookings,0);
 assert.equal(googleAds.detailedCounts.booking_completed,0);
 assert.equal(googleAds.revenueCents,0);
});

test("does not count a Facebook browse-only visitor as a booking",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"inventory_view",booking_attribution_sessions:{utm_source:"facebook"}},
 ]);
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.ok(facebook);
 assert.equal(facebook.visits,1);
 assert.equal(facebook.bookings,0);
 assert.equal(facebook.revenueCents,0);
});

test("does not count abandoned checkout as a booking until the persisted booking is confirmed",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"checkout_started",booking_attribution_sessions:{utm_source:"facebook"}},
 ],[
  {booking_id:"b1",status:"pending_payment",total_cents:41000,booking_attribution_snapshots:{utm_source:"facebook"}},
 ]);
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.ok(facebook);
 assert.equal(facebook.bookings,0);
 assert.equal(facebook.revenueCents,0);
});

test("keeps a paid booking in the funnel after it advances to scheduled operations",()=>{
 const report=buildSourcePerformanceReport([], [
  {booking_id:"b1",status:"scheduled",total_cents:27500,booking_attribution_snapshots:{utm_source:"facebook"}},
 ],{facebook:5000});
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.ok(facebook);
 assert.equal(facebook.bookings,1);
 assert.equal(facebook.revenueCents,27500);
 assert.equal(facebook.spendCents,5000);
 assert.equal(facebook.roas,5.5);
});

test("facebook paid visitor who reaches /booking counts as a booking start before submit",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{utm_source:"facebook",utm_medium:"paid_social",fbclid:"meta-click"}},
  {attribution_session_id:"s1",event_name:"booking_started",booking_attribution_sessions:{utm_source:"facebook",utm_medium:"paid_social",fbclid:"meta-click"}},
 ]);
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.ok(facebook);
 assert.equal(facebook.visits,1);
 assert.equal(facebook.detailedCounts.booking_start,1);
 assert.equal(facebook.stepCounts.find((step)=>step.key==="booking_start")?.count,1);
});

test("Facebook attribution survives the booking route and counts one idempotent start",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"91caf0a8-949d-4670-8833-47ea68a35e17",event_name:"landing_page_view",booking_attribution_sessions:{utm_source:"fb",utm_medium:"paid",utm_campaign:"copper-state",utm_content:"carousel",utm_term:"bounce-house",fbclid:"meta-click"}},
  {attribution_session_id:"91caf0a8-949d-4670-8833-47ea68a35e17",event_name:"booking_started",booking_attribution_sessions:{utm_source:"fb",utm_medium:"paid",utm_campaign:"copper-state",fbclid:"meta-click"}},
  {attribution_session_id:"91caf0a8-949d-4670-8833-47ea68a35e17",event_name:"booking_started",booking_attribution_sessions:{utm_source:"fb",utm_medium:"paid",utm_campaign:"copper-state",fbclid:"meta-click"}},
 ]);
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.equal(facebook?.visits,1);
 assert.equal(facebook?.detailedCounts.booking_start,1);
});

test("counts engagement and conversion stages by unique visitor rather than added event rows",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"inventory_item_clicked",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"booking_cta_click",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"reserve_clicked",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"booking_started",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"checkout_started",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s2",event_name:"landing_view",booking_attribution_sessions:{gclid:"click-2"}},
  {attribution_session_id:"s2",event_name:"booking_started",booking_attribution_sessions:{gclid:"click-2"}},
 ]);
 const googleAds=report.summaries.find((row)=>row.source==="google_ads");
 assert.ok(googleAds);
 assert.equal(googleAds.detailedCounts.booking_start,2);
 assert.equal(googleAds.engaged,2);
 assert.equal(googleAds.conversionStarted,2);
});

test("session metrics attach by normalized source without changing core funnel counts",()=>{
 const report=attachSessionMetricsToSourceReport(buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"booking_started",booking_attribution_sessions:{gclid:"click-1"}},
 ]),[
  {id:"s1",gclid:"click-1",total_session_duration_seconds:42,engaged_duration_seconds:28,page_count:2,engaged_page_count:1},
 ]);
 const googleAds=report.summaries.find((row)=>row.source==="google_ads");
 assert.ok(googleAds);
 assert.equal(googleAds.sessionMetrics.sessionCount,1);
 assert.equal(googleAds.sessionMetrics.avgSessionDurationSeconds,42);
 assert.equal(googleAds.sessionMetrics.avgEngagedDurationSeconds,28);
 assert.equal(googleAds.sessionMetrics.singlePageSessions,0);
 assert.equal(googleAds.detailedCounts.booking_start,1);
});

test("groups active session duration into readable time-on-site buckets",()=>{
 const buckets=buildSessionDurationBuckets([
  {id:"unavailable",total_session_duration_seconds:0},
  {id:"s1",total_session_duration_milliseconds:500},
  {id:"s2",total_session_duration_milliseconds:2500},
  {id:"s3",total_session_duration_milliseconds:7000},
  {id:"s4",total_session_duration_milliseconds:12_000},
 ]);
 assert.deepEqual(buckets.map((bucket)=>bucket.count),[1,1,1,1,1]);
});

test("visitor arriving from Meta who clicks Book Now within 700ms is engaged, not a quick exit",()=>{
 const report=buildSessionQualityReport([
  {id:"s1",utm_source:"facebook",utm_medium:"paid_social",fbclid:"meta-click",first_landing_path:"/",device_type:"mobile",browser:"safari",total_session_duration_milliseconds:700,time_to_first_interaction_milliseconds:700,first_interaction_type:"booking_cta_click",first_interaction_label:"Book Now",meaningful_interaction_count:1,page_count:1,automated_classification:"human_likely"},
 ]);
 assert.equal(report.engagedSessions,1);
 assert.equal(report.quickExits,0);
 assert.equal(report.buckets.find((bucket)=>bucket.key==="under_1_second")?.details[0]?.engagementClassification,"engaged");
});

test("short human-like Meta visit with no action is classified as a quick exit",()=>{
 const report=buildSessionQualityReport([
  {id:"s1",utm_source:"facebook",utm_medium:"paid_social",fbclid:"meta-click",first_landing_path:"/",device_type:"mobile",browser:"safari",total_session_duration_milliseconds:600,page_count:1,meaningful_interaction_count:0,automated_classification:"human_likely"},
 ]);
 assert.equal(report.engagedSessions,0);
 assert.equal(report.quickExits,1);
 assert.equal(report.buckets.find((bucket)=>bucket.key==="under_1_second")?.details[0]?.engagementClassification,"quick_exit");
});

test("Facebook link-preview crawler is classified as automated_likely",()=>{
 assert.equal(automatedTrafficClassification({id:"crawler",browser:"other",automated_classification:"automated_likely",total_session_duration_milliseconds:0}),"automated_likely");
});

test("session-quality report preserves first-touch attribution after navigation and can exclude automated sessions",()=>{
 const report=buildSessionQualityReport([
  {id:"meta-human",utm_source:"facebook",utm_medium:"paid_social",fbclid:"meta-click",first_landing_path:"/",last_path:"/booking",device_type:"mobile",browser:"safari",total_session_duration_milliseconds:1800,page_count:2,time_to_first_interaction_milliseconds:700,first_interaction_type:"booking_cta_click",meaningful_interaction_count:1,automated_classification:"human_likely"},
  {id:"meta-preview",utm_source:"facebook",fbclid:"meta-preview",first_landing_path:"/",device_type:"desktop",browser:"other",total_session_duration_milliseconds:200,page_count:1,automated_classification:"automated_likely"},
 ],{includeAutomated:false});
 assert.equal(report.visibleSessions,1);
 assert.equal(report.totalSessions,2);
 assert.equal(report.verifiedSessions,1);
 assert.equal(report.unverifiedSessions,0);
 assert.equal(report.buckets.find((bucket)=>bucket.key==="one_to_four_seconds")?.sourceBreakdown[0]?.label,"Meta Ads");
 assert.equal(report.landingPagePerformance[0]?.path,"/");
 assert.equal(report.landingPagePerformance[0]?.trafficSources[0]?.label,"Meta Ads");
});

test("session engagement classification stays neutral for historical rows missing new fields",()=>{
 assert.equal(sessionEngagementClassification({id:"historic",total_session_duration_seconds:0,page_count:0}),"neutral");
});

test("historical rows without timing stay unverified instead of becoming fake zero-length sessions",()=>{
 assert.equal(verificationStatusForSession({id:"historic",total_session_duration_seconds:0,page_count:1}),"unverified_activity");
});

test("replayed completion events do not double-count one persisted booking",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"booking_completed",booking_id:"b1",booking_total_cents:25000,booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"booking_completed",booking_id:"b1",booking_total_cents:25000,booking_attribution_sessions:{gclid:"click-1"}},
  {attribution_session_id:"s1",event_name:"payment_completed",booking_id:"b1",amount_paid_cents:25000,booking_attribution_sessions:{gclid:"click-1"}},
 ],[
  {booking_id:"b1",status:"confirmed",total_cents:25000,booking_attribution_snapshots:{gclid:"click-1"}},
 ]);
 const googleAds=report.summaries.find((row)=>row.source==="google_ads");
 assert.equal(googleAds?.bookings,1);
 assert.equal(googleAds?.revenueCents,25000);
});

test("returns insufficient-data insight under the visit threshold",()=>{
 const report=buildSourcePerformanceReport(Array.from({length:24},(_,index)=>({attribution_session_id:`s${index}`,event_name:"landing_view",booking_attribution_sessions:{utm_source:"facebook"}})));
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.equal(facebook?.insight,"Not enough traffic yet to make a reliable recommendation.");
});

test("classifies booking revenue from snapshot referrer-only attribution",()=>{
 const report=buildSourcePerformanceReport([],[
  {booking_id:"b1",status:"confirmed",total_cents:15000,booking_attribution_snapshots:{first_referrer:"https://m.facebook.com/"}},
 ]);
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.equal(facebook?.bookings,1);
 assert.equal(facebook?.revenueCents,15000);
});


test("keeps landing-page attribution through checkout and counts only unique funnel events",()=>{
 const report=buildLandingPageFunnelReport({
  sessions:[{id:"s1",first_landing_path:"/fall-party-special",utm_source:"facebook",utm_campaign:"Fall"}],
  events:[
   {attribution_session_id:"s1",event_name:"promotion_primary_cta_clicked",event_key:"cta-1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
   {attribution_session_id:"s1",event_name:"promotion_primary_cta_clicked",event_key:"cta-1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
   {attribution_session_id:"s1",event_name:"booking_started",event_key:"booking-page",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
   {attribution_session_id:"s1",event_name:"item_added_to_cart",event_key:"item-1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
   {attribution_session_id:"s1",event_name:"checkout_started",event_key:"checkout-1",booking_id:"b1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
   {attribution_session_id:"s1",event_name:"checkout_started",event_key:"checkout-1",booking_id:"b1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  ],
  bookings:[{booking_id:"b1",status:"confirmed",total_cents:17500,booking_attribution_snapshots:{first_landing_path:"/fall-party-special",utm_campaign:"Fall"}}],
 });
 assert.deepEqual(report[0]&&{path:report[0].path,sessions:report[0].sessions,cta:report[0].ctaClicks,bookingVisits:report[0].bookingPageVisits,items:report[0].itemSelections,checkout:report[0].checkoutStarts,bookings:report[0].completedBookings,revenue:report[0].revenueCents},{path:"/fall-party-special",sessions:1,cta:1,bookingVisits:1,items:1,checkout:1,bookings:1,revenue:17500});
});

test("keeps intentional repeated CTA interactions while CTA rate remains session based",()=>{
 const report=buildLandingPageFunnelReport({sessions:[{id:"s1",first_landing_path:"/fall-party-special"}],events:[
  {attribution_session_id:"s1",event_name:"booking_cta_click",event_key:"cta-1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",event_name:"booking_cta_click",event_key:"cta-2",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
 ],bookings:[]});
 assert.equal(report[0]?.ctaClicks,2);
 assert.equal(report[0]?.ctaRate,1);
});

test("groups idempotent checkout steps under their originating landing page",()=>{
 const report=buildLandingPageFunnelReport({sessions:[{id:"s1",first_landing_path:"/fall-party-special"}],events:[
  {attribution_session_id:"s1",booking_id:"b1",event_name:"checkout_started",event_key:"b1:checkout",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",booking_id:"b1",event_name:"customer_info_completed",event_key:"b1:customer",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",booking_id:"b1",event_name:"customer_info_completed",event_key:"b1:customer",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",booking_id:"b1",event_name:"payment_succeeded",event_key:"b1:paid",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
 ],bookings:[]});
 assert.deepEqual(report[0]?.checkoutSteps,{checkout_started:1,checkout_addons_viewed:0,checkout_addons_skipped:0,checkout_addons_added:0,reservation_details_viewed:0,customer_info_completed:1,delivery_address_completed:0,delivery_fee_presented:0,terms_accepted:0,payment_cta_clicked:0,payment_started:0,payment_succeeded:1,booking_confirmed:0});
});

test("keeps add-on branch events attributed and session-deduped in the checkout funnel",()=>{
 const report=buildLandingPageFunnelReport({sessions:[{id:"s1",first_landing_path:"/fall-party-special",utm_source:"facebook"}],events:[
  {attribution_session_id:"s1",event_name:"checkout_started",event_key:"checkout",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",event_name:"checkout_addons_viewed",event_key:"addons-view",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",event_name:"checkout_addons_viewed",event_key:"addons-view",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",event_name:"checkout_addons_added",event_key:"addons-added",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",event_name:"reservation_details_viewed",event_key:"details",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
 ],bookings:[]});
 assert.deepEqual(report[0]?.checkoutSteps,{checkout_started:1,checkout_addons_viewed:1,checkout_addons_skipped:0,checkout_addons_added:1,reservation_details_viewed:1,customer_info_completed:0,delivery_address_completed:0,delivery_fee_presented:0,terms_accepted:0,payment_cta_clicked:0,payment_started:0,payment_succeeded:0,booking_confirmed:0});
});

test("groups delivery fee presentations by the latest session pricing state without retaining address data",()=>{
 const report=buildLandingPageFunnelReport({sessions:[{id:"free",first_landing_path:"/fall-party-special"},{id:"paid",first_landing_path:"/fall-party-special"}],events:[
  {attribution_session_id:"free",event_name:"delivery_fee_presented",event_key:"free:0",metadata:{delivery_fee_cents:0,had_delivery_fee:false,subtotal_cents:20000,discount_cents:0,tax_cents:0,final_total_cents:20000}},
  {attribution_session_id:"paid",event_name:"delivery_fee_presented",event_key:"paid:old",occurred_at:"2026-09-23T10:00:00Z",metadata:{delivery_fee_cents:2500,had_delivery_fee:true,subtotal_cents:20000,discount_cents:0,tax_cents:0,final_total_cents:22500}},
  {attribution_session_id:"paid",event_name:"delivery_fee_presented",event_key:"paid:new",occurred_at:"2026-09-23T10:01:00Z",metadata:{delivery_fee_cents:5000,had_delivery_fee:true,subtotal_cents:20000,discount_cents:0,tax_cents:0,final_total_cents:25000}},
  {attribution_session_id:"free",event_name:"terms_accepted"},
 ],bookings:[]});
 assert.deepEqual(report[0]?.deliveryFeeAnalysis,{zeroFeeSessions:1,paidFeeSessions:1,averagePaidFeeCents:5000,zeroFeeTermsAcceptedRate:1,paidFeeTermsAcceptedRate:0});
 assert.equal(report[0]?.checkoutSteps.delivery_fee_presented,2);
});

test("delivery fee telemetry emits only pricing metadata and keys each presented price state",async()=>{
 const [booking,route]=await Promise.all([readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8"),readFile(new URL("../app/api/public-booking/[businessSlug]/funnel/route.ts",import.meta.url),"utf8")]);
 assert.match(booking,/"delivery_fee_presented"/);assert.match(booking,/delivery_fee_cents:deliveryFee/);assert.match(booking,/final_total_cents:total/);
 assert.doesNotMatch(booking,/delivery_fee_presented[^\n]{0,500}(street|address|postal|zip|placeId)/i);
 assert.match(route,/case "delivery_fee_presented"/);assert.match(route,/metadata\.delivery_fee_cents/);assert.match(route,/metadata\.final_total_cents/);
});

test("keeps checkout table and drill-down starts in parity across aliases, retries, and distinct attributed sessions",()=>{
 const sessions=["s1","s2","s3","s4"].map((id)=>({id,first_landing_path:"/fall-party-special",utm_source:"facebook"}));
 const report=buildLandingPageFunnelReport({sessions,events:[
  {attribution_session_id:"s1",event_name:"initiate_checkout",event_key:"s1:initiate",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",event_name:"checkout_started",event_key:"b1:checkout",booking_id:"b1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s1",event_name:"checkout_started",event_key:"b1:checkout",booking_id:"b1",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s2",event_name:"initiate_checkout",event_key:"s2:initiate",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s3",event_name:"checkout_started",event_key:"b3:checkout",booking_id:"b3",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
  {attribution_session_id:"s4",event_name:"checkout_started",event_key:"b4:checkout",booking_id:"b4",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
 ],bookings:[]});
 assert.equal(report[0]?.checkoutStarts,4);
 assert.equal(report[0]?.checkoutSteps.checkout_started,4);
});

test("keeps checkout table and drill-down filters aligned because both consume the same filtered event set",()=>{
 const report=buildLandingPageFunnelReport({sessions:[{id:"in-range",first_landing_path:"/fall-party-special"}],events:[
  {attribution_session_id:"in-range",event_name:"checkout_started",event_key:"in-range:checkout",booking_attribution_sessions:{first_landing_path:"/fall-party-special"}},
 ],bookings:[]});
 assert.equal(report[0]?.checkoutStarts,1);
 assert.equal(report[0]?.checkoutSteps.checkout_started,1);
});

test("landing performance renders a compact checkout drill-down",async()=>{
 const [page,styles]=await Promise.all([readFile(new URL("../app/app/[businessSlug]/marketing/funnel/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/globals.css",import.meta.url),"utf8")]);
 assert.match(page,/marketing-checkout-drilldown/);
 assert.match(page,/No checkout-step data yet/);
 assert.match(page,/checkoutDropoff/);
 assert.match(styles,/\.marketing-session-landing-table>details\{display:block;min-width:1480px\}/);
 assert.match(styles,/\.marketing-checkout-drilldown>div\{grid-template-columns:repeat\(8,minmax\(0,1fr\)\);overflow:visible\}/);
});
