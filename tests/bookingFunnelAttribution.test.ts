import assert from "node:assert/strict";
import test from "node:test";
import {attributionFromSearch,validSessionId} from "../lib/bookingFunnel.ts";
import {attachSessionMetricsToSourceReport,buildSourcePerformanceReport,normalizeMarketingSource} from "../lib/marketingAttribution.ts";

test("captures Google click IDs and UTMs without retaining unrelated query values",()=>{
 const values=attributionFromSearch(new URLSearchParams("gclid=click-1&utm_source=google&utm_medium=cpc&utm_campaign=summer&email=private@example.com"));
 assert.deepEqual(values,{gclid:"click-1",utm_source:"google",utm_medium:"cpc",utm_campaign:"summer"});
});

test("captures fbclid alongside other first-touch attribution fields",()=>{
 const values=attributionFromSearch(new URLSearchParams("fbclid=meta-click-1&utm_source=facebook&utm_campaign=fall"));
 assert.deepEqual(values,{fbclid:"meta-click-1",utm_source:"facebook",utm_campaign:"fall"});
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
