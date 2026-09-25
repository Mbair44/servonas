import assert from "node:assert/strict";
import test from "node:test";
import {normalizeMarketingSource,normalizeSessionAttribution,buildSourcePerformanceReport,buildSourceCheckoutFunnelReport,buildCampaignPerformanceReport,buildSessionQualityReport,attachSessionMetricsToSourceReport,type AttributionSessionLike,type MetaPerformanceNameRow} from "../lib/marketingAttribution.ts";
import {sourcePaidEconomics,totalPaidEconomics} from "../lib/paidSourceEconomics.ts";
import {loadMetaAttributionResources} from "../lib/metaAttributionResources.ts";

const resources:MetaPerformanceNameRow[]=[{campaign_id:"120251997988010024",campaign_name:"Fall campaign",adset_id:"120251997988000024",adset_name:"Fall ad set",ad_id:"120251997987990024",ad_name:"Fall ad"}];

test("explicit social UTMs classify Facebook and Instagram as Organic Social, including fbclid-bearing bio links",()=>{
 for(const session of [
  {utm_source:"ig",utm_medium:"social",utm_content:"link_in_bio",fbclid:"click"},
  {utm_source:"ig",utm_medium:"social",utm_content:"link_in_bio"},
  {utm_source:"instagram",utm_medium:"social"},
  {utm_source:"facebook",utm_medium:"social"},
  {utm_source:"facebook",utm_medium:"organic"},
  {utm_source:"instagram",utm_medium:"organic_social"},
  {first_referrer:"https://l.instagram.com/",utm_medium:"social"},
  {first_referrer:"https://l.instagram.com/",utm_medium:"organic"},
 ])assert.equal(normalizeMarketingSource(session,resources),"organic_social");
});

test("paid Meta media require Meta origin and exact unambiguous paid conventions",()=>{
 for(const utm_source of ["fb","facebook","ig","instagram","meta"]){
  for(const utm_medium of ["paid_social","paid","cpc","ppc"]){
   assert.equal(normalizeMarketingSource({utm_source,utm_medium}),"meta_ads");
  }
 }
 assert.equal(normalizeMarketingSource({utm_source:" Instagram ",utm_medium:" PAID_SOCIAL "}),"meta_ads");
 assert.equal(normalizeMarketingSource({utm_source:"other",utm_medium:"paid_social"}),"unknown");
 for(const utm_medium of ["unpaid","not_paid_social","social","paid-ish"]){
  assert.notEqual(normalizeMarketingSource({utm_source:"facebook",utm_medium}),"meta_ads");
 }
});

test("only tenant-resolved numeric Meta resources establish paid traffic without paid media",()=>{
 for(const [field,id] of [["utm_campaign",resources[0].campaign_id],["utm_id",resources[0].campaign_id],["utm_term",resources[0].adset_id],["utm_content",resources[0].ad_id]] as const){
  const session={utm_source:"ig",[field]:id};
  assert.equal(normalizeMarketingSource(session,resources),"meta_ads");
  assert.equal(normalizeMarketingSource(session,[]),"meta_unspecified");
 }
 assert.equal(normalizeMarketingSource({utm_source:"ig",utm_campaign:"999999999999999999"},resources),"meta_unspecified");
 assert.equal(normalizeMarketingSource({utm_source:"ig",utm_campaign:"Fall campaign"},resources),"meta_unspecified");
 assert.equal(normalizeMarketingSource({utm_source:"ig",utm_campaign:"{{campaign.id}}"},resources),"meta_unspecified");
 assert.equal(normalizeMarketingSource({utm_source:"ig",utm_campaign:resources[0].campaign_id},[{...resources[0],campaign_name:null}]),"meta_ads");
 // A verified ad resource is stronger evidence than a conflicting generic social medium.
 assert.equal(normalizeMarketingSource({utm_source:"ig",utm_medium:"social",utm_content:resources[0].ad_id},resources),"meta_ads");
});

test("Meta referral and click IDs alone establish origin, never paid status",()=>{
 for(const session of [
  {fbclid:"click"}, {fbclid:"click",utm_source:"instagram"},
  {utm_source:"facebook"}, {utm_source:"ig"},
  ...["m.facebook.com","l.facebook.com","www.facebook.com","l.instagram.com"].map(host=>({first_referrer:`https://${host}/`})),
 ])assert.equal(normalizeMarketingSource(session,resources),"meta_unspecified");
 assert.equal(normalizeMarketingSource({first_referrer:"https://facebook.com.example.org/"}),"referral");
});

test("Google Ads, GBP, organic search, email, direct and referral keep their channel precedence",()=>{
 const cases:Array<[AttributionSessionLike,string]>=[
  [{gclid:"g",fbclid:"f",utm_source:"ig",utm_medium:"social"},"google_ads"],
  [{gbraid:"g",utm_source:"facebook",utm_medium:"paid_social"},"google_ads"],
  [{wbraid:"g",utm_campaign:"google_business_profile"},"google_ads"],
  [{utm_source:"google",utm_medium:"cpc",fbclid:"f"},"google_ads"],
  [{utm_source:"google",utm_campaign:"google_business_profile",fbclid:"f"},"google_business_profile"],
  [{utm_source:"google",utm_medium:"organic"},"organic"],
  [{first_referrer:"https://search.yahoo.com/search?p=rentals"},"organic"],
  [{utm_source:"email",fbclid:"f"},"email"],
  [{utm_medium:"referral",first_referrer:"https://partner.example/"},"referral"],
  [{first_referrer:"https://partner.example/"},"referral"],
  [{},"direct"], [{utm_source:"direct"},"direct"],
 ];
 for(const [session,expected] of cases)assert.equal(normalizeMarketingSource(session,resources),expected);
});

test("sessions, events, booking snapshots, checkout activity and paid ROAS share evidence without mutating history",()=>{
 const sessions=[
  {id:"paid",utm_source:"ig",utm_content:resources[0].ad_id},
  {id:"social",utm_source:"ig",utm_medium:"social",utm_content:"link_in_bio",fbclid:"bio-click"},
  {id:"unspecified",fbclid:"unknown-click",utm_campaign:"Unverified name"},
 ];
 const before=JSON.stringify(sessions);
 const events=sessions.flatMap(session=>["landing_view","booking_started","delivery_address_completed"].map(event_name=>({event_name,attribution_session_id:session.id,booking_attribution_sessions:session})));
 const bookings=sessions.map((session,index)=>({booking_id:session.id,status:"confirmed",total_cents:(index+1)*10000,booking_attribution_snapshots:session}));
 const report=attachSessionMetricsToSourceReport(buildSourcePerformanceReport(events,bookings,{meta_ads:5000},resources),sessions,resources);
 for(const source of ["meta_ads","organic_social","meta_unspecified"] as const){
  const row=report.summaries.find(row=>row.source===source)!;
  assert.equal(row.visits,1);assert.equal(row.bookings,1);assert.equal(row.sessionMetrics.sessionCount,1);
  const funnel=buildSourceCheckoutFunnelReport({source,sessions,events,bookings,metaPerformanceRows:resources});
  assert.equal(funnel.completedBookings,1);assert.equal(funnel.checkoutSteps.delivery_address_completed,1);assert.equal(funnel.checkoutSteps.customer_info_completed,0);
 }
 const campaignRows=buildCampaignPerformanceReport({sessions,events,bookings,metaPerformanceRows:resources});
 for(const source of ["organic_social","meta_unspecified"]){
  const row=campaignRows.find(row=>row.source===source)!;
  assert.equal(row.resourceLevel,null);assert.equal(row.rawId,null);assert.equal(row.name,"Unattributed");
 }
 assert.equal(campaignRows.find(row=>row.source==="meta_ads")?.resourceLevel,"ad");
 const statuses=[{provider:"meta",state:"connected_with_data",spendCents:5000,lastSyncError:null},{provider:"google_ads",state:"connected_synced_no_data",spendCents:0,lastSyncError:null}] as const;
 for(const source of ["organic_social","meta_unspecified"]){
  assert.deepEqual(sourcePaidEconomics(source,999999,12,[...statuses]),{spendCents:null,roas:null,costPerBookingCents:null});
 }
 const total=totalPaidEconomics(report.summaries,[...statuses]);
 assert.equal(total.revenueCents,10000);assert.equal(total.bookings,1);assert.equal(total.roas,2);
 assert.equal(report.totals.revenueCents,60000);
 assert.equal(sourcePaidEconomics("meta_ads",10000,1,[...statuses]).spendCents,5000);
 assert.equal(normalizeSessionAttribution(sessions[1],resources).providerLabel,"Organic Social");
 const quality=buildSessionQualityReport(sessions,{metaPerformanceRows:resources});
 const details=quality.buckets.flatMap(bucket=>bucket.details);
 assert.equal(details.find(row=>row.id==="unspecified")?.source,"meta_unspecified");
 assert.equal(details.find(row=>row.id==="paid")?.source,"meta_ads");
 assert.equal(JSON.stringify(sessions),before);
});

test("resource lookup paginates tenant history independently of spend dates and fails closed",async()=>{
 for(const fail of [false,true]){
  const calls:Array<{filters:Array<[string,unknown]>;range?:number[];orders:string[]}>=[];
  const db={from(table:string){
   assert.equal(table,"business_ad_platform_daily_performance");
   const call={filters:[] as Array<[string,unknown]>,orders:[] as string[],range:[] as number[]};calls.push(call);
   const query={select(){return query;},eq(key:string,value:unknown){call.filters.push([key,value]);return query;},order(key:string){call.orders.push(key);return query;},range(from:number,to:number){call.range=[from,to];return Promise.resolve({data:from===0?Array(1000).fill(resources[0]):[{...resources[0],ad_id:"120251997987990025"}],error:fail?{message:"unavailable"}:null});}};
   return query;
  }};
  const result=await loadMetaAttributionResources(db as unknown as Parameters<typeof loadMetaAttributionResources>[0],"tenant-a");
  assert.equal(result.available,!fail);
  assert.equal(result.rows.length,fail?0:2);
  assert.equal(calls.length,fail?1:2);
  for(const call of calls)assert.deepEqual(call.filters,[["business_id","tenant-a"],["provider","meta"]]);
  if(!fail)assert.deepEqual(calls[1].range,[1000,1999]);
 }
});
