import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {normalizeMarketingSource,organicProviderFor,googleBusinessProfileActionFor,buildGoogleBusinessProfileActionPerformanceReport,buildOrganicProviderPerformanceReport,buildSourcePerformanceReport,buildSourceCheckoutFunnelReport,classifySessionQualitySource,type AttributionSessionLike,type FunnelEventRow,type AttributedBookingRow} from "../lib/marketingAttribution.ts";

const gbp={utm_source:"google",utm_medium:"organic",utm_campaign:"google_business_profile"};
test("explicit GBP attribution and action normalization preserve paid precedence",()=>{
 for(const session of [gbp,{utm_source:" GOOGLE ",utm_medium:" ORGANIC ",utm_campaign:" GOOGLE_BUSINESS_PROFILE "}]){
  assert.equal(normalizeMarketingSource(session),"google_business_profile");
  assert.equal(googleBusinessProfileActionFor(session),"website");
  assert.equal(organicProviderFor(session),null);
  assert.equal(classifySessionQualitySource(session),"google_business_profile");
 }
 assert.equal(googleBusinessProfileActionFor({...gbp,utm_content:" Booking "}),"booking");
 assert.equal(googleBusinessProfileActionFor({...gbp,utm_content:"directions"}),"other");
 assert.equal(googleBusinessProfileActionFor({utm_source:"google_business_profile"}),"other");
 for(const click of ["gclid","gbraid","wbraid"]){
  assert.equal(normalizeMarketingSource({...gbp,[click]:"paid-id"}),"google_ads");
  assert.equal(googleBusinessProfileActionFor({...gbp,[click]:"paid-id"}),null);
 }
 for(const medium of ["cpc","ppc","paid","display","search"]){
  assert.equal(normalizeMarketingSource({...gbp,utm_medium:medium}),"google_ads");
  assert.equal(normalizeMarketingSource({utm_source:"google",utm_medium:medium}),"google_ads");
 }
 for(const session of [{utm_source:"google",utm_medium:"organic"},{first_referrer:"https://www.google.com/search?q=bounce"}]){
  assert.equal(normalizeMarketingSource(session),"organic");
  assert.equal(organicProviderFor(session),"google");
 }
 assert.equal(organicProviderFor({first_referrer:"https://duckduckgo.com/"}),"duckduckgo");
 assert.equal(normalizeMarketingSource({utm_source:"google"}),"google");
});

test("historical report-time regrouping reconciles actions, organic children and all totals without mutation",()=>{
 const sessions=[gbp,{...gbp,utm_content:"booking"},{...gbp,utm_content:"directions"},{utm_source:"google",utm_medium:"organic"},{utm_source:"bing",utm_medium:"organic"},{utm_source:"google",utm_medium:"cpc"},{utm_source:"facebook",utm_medium:"paid_social"}].map((s,i)=>({...s,id:`historical-${i}`,first_landing_path:"/"}));
 const events:FunnelEventRow[]=sessions.flatMap(s=>["landing_view","inventory_view","booking_started","checkout_started"].map(event_name=>({event_name,attribution_session_id:s.id,booking_attribution_sessions:s})));
 const bookings:AttributedBookingRow[]=sessions.map((s,i)=>({booking_id:`b${i}`,status:"confirmed",total_cents:(i+1)*1000,booking_attribution_snapshots:s}));
 const saved=JSON.stringify({sessions,events,bookings});
 const report=buildSourcePerformanceReport(events,bookings);
 const metrics=(s:{visits:number;engaged:number;bookings:number;revenueCents:number;detailedCounts:Record<string,number>})=>[s.visits,s.engaged,s.detailedCounts.booking_start??0,s.bookings,s.revenueCents];
 const sum=(rows:number[][])=>rows.reduce((a,r)=>a.map((v,i)=>v+r[i]!),[0,0,0,0,0]);
 const parent=report.summaries.find(r=>r.source==="google_business_profile")!;
 assert.deepEqual(metrics(parent),[3,3,3,3,6000]);
 const children=buildGoogleBusinessProfileActionPerformanceReport(events,bookings);
 assert.deepEqual(sum(children.map(r=>metrics(r.summary!))),metrics(parent));
 assert.deepEqual(children.map(r=>[r.action,r.summary?.visits]),[["website",1],["booking",1],["other",1]]);
 const organic=report.summaries.find(r=>r.source==="organic")!;
 assert.deepEqual(sum(buildOrganicProviderPerformanceReport(events,bookings).map(r=>metrics(r.summary))),metrics(organic));
 const before=(s:AttributionSessionLike)=>({...s,utm_campaign:null});
 const baseline=buildSourcePerformanceReport(events.map(e=>({...e,booking_attribution_sessions:before(e.booking_attribution_sessions as AttributionSessionLike)})),bookings.map(b=>({...b,booking_attribution_snapshots:before(b.booking_attribution_snapshots as AttributionSessionLike)})));
 assert.deepEqual(sum(report.summaries.map(metrics)),sum(baseline.summaries.map(metrics)));
 assert.deepEqual(report.totals,baseline.totals);
 for(const source of ["google_ads","facebook"]){assert.deepEqual(report.summaries.find(r=>r.source===source),baseline.summaries.find(r=>r.source===source));}
 const funnel=buildSourceCheckoutFunnelReport({source:"google_business_profile",sessions,events,bookings});
 assert.equal(funnel.checkoutStarts,3);
 assert.equal(funnel.completedBookings,3);
 assert.equal(funnel.checkoutSteps.checkout_started,3);
 assert.equal(JSON.stringify({sessions,events,bookings}),saved);
});

test("funnel renders GBP action metrics alongside the shared source checkout drill-down",async()=>{
 const page=await readFile(new URL("../app/app/[businessSlug]/marketing/funnel/page.tsx",import.meta.url),"utf8");
 assert.match(page,/buildGoogleBusinessProfileActionPerformanceReport\(\[\.\.\.events,\.\.\.sessionVisitRows\],attributedBookings\)/);
 assert.match(page,/gbpActionRows.map/);
 assert.match(page,/labelForGoogleBusinessProfileAction\(action\)/);
 assert.match(page,/marketingSources.map\(\(trafficSource\) => \[trafficSource, buildSourceCheckoutFunnelReport/);
 assert.match(page,/<CheckoutFunnelDrilldown funnel=\{funnel\}/);
 assert.match(page,/does not connect a query to a specific session/);
});
