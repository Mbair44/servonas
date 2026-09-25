import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {buildLandingPageFunnelReport,deliveryFeeOutcomes,type FunnelEventRow} from "../lib/marketingAttribution.ts";

const time=(minute:number)=>`2026-09-25T08:${String(minute).padStart(2,"0")}:00Z`;
const event=(id:string,name:string,minute=1,path="/fall-party-special"):FunnelEventRow=>({attribution_session_id:id,event_name:name,occurred_at:time(minute),booking_attribution_sessions:{first_landing_path:path}});
const fee=(id:string,cents:unknown,minute=0,path="/fall-party-special",financial:Record<string,unknown>={}):FunnelEventRow=>({...event(id,"delivery_fee_presented",minute,path),metadata:{delivery_fee_cents:cents,...financial}});
const report=(events:FunnelEventRow[])=>buildLandingPageFunnelReport({sessions:[],events,bookings:[]});
const analysis=(events:FunnelEventRow[])=>report(events)[0]?.deliveryFeeAnalysis;

test("delivery fees bucket exact cent boundaries, with safe zero denominators",()=>{
 const result=analysis([0,1,2500,2501,5000,5001,7500,7501].map((cents,i)=>fee(String(i),cents)))!;
 assert.deepEqual(result.buckets.map(bucket=>bucket.sessions),[1,2,2,2,1]);
 assert.equal(result.sessions,8);
 for(const bucket of result.buckets)for(const outcome of deliveryFeeOutcomes)assert.equal(bucket.outcomes[outcome].rate,0);
 const empty=analysis([fee("one",0)])!.buckets[1]!;
 assert.equal(empty.sessions,0);
 for(const outcome of deliveryFeeOutcomes)assert.deepEqual(empty.outcomes[outcome],{sessions:0,rate:null});
});

test("deduplicates presentations and outcomes within the same cohort; unrelated sessions cannot convert it",()=>{
 const events=[fee("a",2500),fee("a",2500),fee("b",2500),...deliveryFeeOutcomes.flatMap(name=>[event("a",name),event("a",name),event("unrelated",name)])];
 const bucket=analysis(events)!.buckets[1]!;
 assert.equal(bucket.sessions,2);
 for(const name of deliveryFeeOutcomes)assert.deepEqual(bucket.outcomes[name],{sessions:1,rate:0.5});
});

test("booking #63 shape joins client and server events by attribution session, never booking id",()=>{
 const session="session-A";
 const events=[
  {...fee(session,2500,1),booking_id:null},
  {...event(session,"terms_accepted",2),booking_id:null},
  {...event(session,"payment_cta_clicked",3),booking_id:null},
  {...event(session,"payment_started",4),booking_id:"booking-63"},
  {...event(session,"payment_succeeded",5),booking_id:"booking-63"},
  {...event(session,"booking_confirmed",6),booking_id:"booking-63"},
  {...event("other-session","terms_accepted",2),booking_id:"other-booking"},
  {...event("other-session","payment_started",4),booking_id:"booking-63"},
 ];
 const bucket=analysis(events)!.buckets[1]!;
 assert.equal(bucket.sessions,1);
 assert.equal(bucket.outcomes.terms_accepted.sessions,1);
 assert.equal(bucket.outcomes.payment_cta_clicked.sessions,1);
 assert.equal(bucket.outcomes.payment_started.sessions,1);
 assert.equal(bucket.outcomes.payment_succeeded.sessions,1);
 assert.equal(bucket.outcomes.booking_confirmed.sessions,1);
});

test("uses final fee before payment, ignoring later fees and input order",()=>{
 const events=[fee("a",2500,0),fee("a",5000,2),fee("a",9000,5),event("a","terms_accepted",1),event("a","payment_cta_clicked",3),event("a","booking_confirmed",4)];
 const result=analysis(events)!;
 assert.deepEqual(result,analysis([...events].reverse()));
 const bucket=result.buckets[2]!;
 assert.equal(bucket.sessions,1);
 assert.equal(bucket.outcomes.terms_accepted.rate,0); // Acceptance predates the revised price.
 assert.equal(bucket.outcomes.payment_cta_clicked.rate,1);
 assert.equal(bucket.outcomes.booking_confirmed.rate,1); // No payment_started prerequisite.
 assert.equal(bucket.outcomes.payment_started.rate,0);
 assert.equal(result.buckets[4]!.sessions,0);
});

test("without payment progression uses latest fee; equal timestamp ties are deterministic",()=>{
 const events=[{...fee("a",2500,0),event_key:"a"},{...fee("a",7500,0),event_key:"b"},event("a","terms_accepted",1)];
 assert.deepEqual(analysis(events),analysis([...events].reverse()));
 assert.equal(analysis(events)!.buckets[3]!.outcomes.terms_accepted.rate,1);
});

test("outcomes need no perfect sequence but must follow presentation; payment-only fallback freezes fee",()=>{
 const result=analysis([fee("a",2500,0),event("a","payment_succeeded",2),event("a","payment_started",3),event("a","terms_accepted",4),fee("a",5000,5)])!;
 assert.equal(result.buckets[1]!.outcomes.payment_succeeded.rate,1);
 assert.equal(result.buckets[1]!.outcomes.payment_started.rate,1);
 assert.equal(result.buckets[1]!.outcomes.terms_accepted.rate,1);
 assert.equal(result.buckets[1]!.outcomes.payment_cta_clicked.rate,0);
 const early=analysis([event("late","payment_started",0),fee("late",2500,1)])!;
 assert.equal(early.sessions,1);
 assert.equal(early.buckets[1]!.outcomes.payment_started.rate,0);
});

test("missing or invalid telemetry is never treated as explicit free delivery",()=>{
 const invalid=[null,undefined,"",false,"0",-1,NaN,Infinity,0.5,{},Number.MAX_SAFE_INTEGER+1];
 const events=[...invalid.map((value,i)=>fee(`invalid-${i}`,value)),event("no-fee","terms_accepted"),{...fee("undated",0),occurred_at:null},fee("valid",0)];
 const result=analysis(events)!;
 assert.equal(result.sessions,1);
 assert.equal(result.buckets[0]!.sessions,1);
 assert.equal(result.buckets[0]!.outcomes.terms_accepted.rate,0);
 assert.equal(analysis([event("no-fee","booking_confirmed")]),null);
});

test("landing rows isolate fee and conversion cohorts even when another path converts",()=>{
 const rows=report([fee("a",2500),fee("b",2500,0,"/other"),event("b","terms_accepted",1,"/other"),event("b","booking_confirmed",2,"/other")]);
 assert.equal(rows.find(row=>row.path==="/fall-party-special")!.deliveryFeeAnalysis!.buckets[1]!.outcomes.booking_confirmed.rate,0);
 assert.equal(rows.find(row=>row.path==="/other")!.deliveryFeeAnalysis!.buckets[1]!.outcomes.booking_confirmed.rate,1);
});

test("associates historical checkout economics with the selected fee presentation",()=>{
 const result=analysis([
  fee("discounted",2500,0,"/fall-party-special",{subtotal_cents:18500,discount_cents:5000,final_total_cents:16000}),
  fee("undiscounted",5000,0,"/fall-party-special",{subtotal_cents:20000,discount_cents:0,final_total_cents:25000}),
  fee("another-session",2500,2,"/fall-party-special",{subtotal_cents:19000,discount_cents:4000,final_total_cents:22000}),
 ])!;
 const first=result.buckets[1]!;
 assert.equal(first.economics.subtotal.averageCents,18750);
 assert.equal(first.economics.discount.averageCents,4500);
 assert.equal(first.economics.delivery.averageCents,2500);
 assert.equal(first.economics.total.averageCents,19000);
 assert.equal(first.economics.deliveryPercent.average,((2500/18500*100)+(2500/19000*100))/2);
 assert.equal(first.economics.subtotal.sessions,2);
});

test("financial averages use independent supported samples and never infer missing values",()=>{
 const result=analysis([
  fee("complete",2500,0,"/fall-party-special",{subtotal_cents:10000,discount_cents:0,final_total_cents:11000}),
  fee("missing-discount",2500,0,"/fall-party-special",{subtotal_cents:20000,final_total_cents:22500}),
  fee("zero-subtotal",2500,0,"/fall-party-special",{subtotal_cents:0,discount_cents:0,final_total_cents:2500}),
 ])!;
 const bucket=result.buckets[1]!;
 assert.equal(bucket.sessions,3);
 assert.equal(bucket.economics.subtotal.averageCents,10000);
 assert.equal(bucket.economics.subtotal.sessions,3);
 assert.equal(bucket.economics.discount.averageCents,0);
 assert.equal(bucket.economics.discount.sessions,2);
 assert.equal(bucket.economics.total.sessions,3);
 assert.equal(bucket.economics.deliveryPercent.sessions,2);
 assert.equal(bucket.economics.deliveryPercent.average,((2500/10000*100)+(2500/20000*100))/2);
});

test("delivery analysis consumes the existing tenant/date/source-scoped ledger without a second query",async()=>{
 const page=await readFile(new URL("../app/app/[businessSlug]/marketing/funnel/page.tsx",import.meta.url),"utf8");
 // Boundary contract: database owns tenant and half-open date filtering; sourceMatches owns attribution filtering.
 assert.match(page,/from\("booking_funnel_events"\).*\.eq\("business_id", business.id\)\.gte\("occurred_at", window.from\)\.lt\("occurred_at", window.to\)/);
 assert.match(page,/const events = .*eventsResponse.data.*filter\(\(row\) => sourceMatches\(row, source, metaPerformanceRows\)\)/);
 assert.match(page,/const landingPageFunnel = buildLandingPageFunnelReport\(\{ sessions, events: \[\.\.\.events, \.\.\.sessionVisitRows\]/);
 // Exercise that input contract with realistic boundary and cross-tenant records.
 const rows=[{...fee("included",2500),tenant:"a"},{...event("included","terms_accepted",1),tenant:"a"},{...event("included","booking_confirmed",2),tenant:"b"},{...fee("outside",0),tenant:"a",occurred_at:"2026-09-26T07:00:00Z"},{...fee("before",0),tenant:"a",occurred_at:"2026-09-25T06:59:59Z"}];
 const filtered=rows.filter(row=>row.tenant==="a"&&row.occurred_at!>="2026-09-25T07:00:00Z"&&row.occurred_at!<"2026-09-26T07:00:00Z");
 const result=analysis(filtered)!;
 assert.equal(result.sessions,1);
 assert.equal(result.buckets[1]!.outcomes.terms_accepted.rate,1);
 assert.equal(result.buckets[1]!.outcomes.booking_confirmed.rate,0);
});
