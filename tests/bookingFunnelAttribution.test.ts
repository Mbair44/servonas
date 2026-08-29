import assert from "node:assert/strict";
import test from "node:test";
import {attributionFromSearch,validSessionId} from "../lib/bookingFunnel.ts";
import {buildSourcePerformanceReport,normalizeMarketingSource} from "../lib/marketingAttribution.ts";

test("captures Google click IDs and UTMs without retaining unrelated query values",()=>{
 const values=attributionFromSearch(new URLSearchParams("gclid=click-1&utm_source=google&utm_medium=cpc&utm_campaign=summer&email=private@example.com"));
 assert.deepEqual(values,{gclid:"click-1",utm_source:"google",utm_medium:"cpc",utm_campaign:"summer"});
});
test("accepts only UUID anonymous attribution session identifiers",()=>{
 assert.equal(validSessionId("9c95b508-72a0-4e01-9c24-2a86bf1f4eb3"),true);
 assert.equal(validSessionId("other-business-session"),false);
});

test("normalizes preserved first-touch Google Ads attribution",()=>{
 assert.equal(normalizeMarketingSource({gclid:"click-1",utm_source:"facebook",first_referrer:"https://facebook.com"}),"google_ads");
});

test("builds source funnel counts, revenue, and roas from the existing event stream",()=>{
 const report=buildSourcePerformanceReport([
  {attribution_session_id:"s1",event_name:"landing_view",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"inventory_view",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"availability_check",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"checkout_started",booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"booking_completed",booking_id:"b1",booking_total_cents:32500,booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s1",event_name:"payment_completed",booking_id:"b1",amount_paid_cents:32500,booking_attribution_sessions:{utm_source:"facebook"}},
  {attribution_session_id:"s2",event_name:"landing_view",booking_attribution_sessions:{gclid:"click-2"}},
 ],{facebook:1800,google_ads:8400});
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 const googleAds=report.summaries.find((row)=>row.source==="google_ads");
 assert.ok(facebook);
 assert.equal(facebook.visits,1);
 assert.equal(facebook.engaged,1);
 assert.equal(facebook.detailedCounts.booking_completed,1);
 assert.equal(facebook.revenueCents,32500);
 assert.equal(facebook.roas?.toFixed(1),"18.1");
 assert.ok(googleAds);
 assert.equal(googleAds.visits,1);
});

test("returns insufficient-data insight under the visit threshold",()=>{
 const report=buildSourcePerformanceReport(Array.from({length:24},(_,index)=>({attribution_session_id:`s${index}`,event_name:"landing_view",booking_attribution_sessions:{utm_source:"facebook"}})));
 const facebook=report.summaries.find((row)=>row.source==="facebook");
 assert.equal(facebook?.insight,"Not enough traffic yet to make a reliable recommendation.");
});
