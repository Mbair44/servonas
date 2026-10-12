import test from "node:test";
import assert from "node:assert/strict";
import {buildBookingJourneyFunnel,type FunnelEventRow,type AttributedBookingRow} from "../lib/marketingAttribution.ts";
const event=(id:string,event_name:string):FunnelEventRow=>({attribution_session_id:id,event_name});
const booking=(id:string,session?:string,status="confirmed"):AttributedBookingRow=>({booking_id:id,status,total_cents:1000,booking_attribution_snapshots:session?{attribution_session_id:session}:null});
test("screenshot case produces a coherent visitor cohort instead of 1700% progression",()=>{
 const events=Array.from({length:76},(_,i)=>event(`s${i}`,"landing_view"));
 events.push(event("s0","inventory_view"));
 for(let i=0;i<17;i++)events.push(event(`s${i}`,"booking_started"));
 for(let i=0;i<6;i++)events.push(event(`s${i}`,"checkout_started"));
 events.push(event("s0","customer_info_started"),event("s1","delivery_address_entered"),event("s2","delivery_address_entered"));
 const result=buildBookingJourneyFunnel(events,[booking("b1","s0")]);
 assert.deepEqual(result.stages.map(s=>s.count),[76,17,6,1]);assert.equal(result.stages[1].conversionRate,17/76);assert.equal(result.stages[2].conversionRate,6/17);assert.equal(result.overallConversionRate,1/76);
 assert.equal(result.observedStages.find(s=>s.key==="item_viewed")?.count,1);
 for(const stage of result.stages){assert.ok(stage.conversionRate===null||stage.conversionRate<=1);assert.ok(stage.dropOffSessions>=0);}
});
test("direct checkout and confirmation count toward milestones without inventing observed events",()=>{
 const result=buildBookingJourneyFunnel([event("a","checkout_started"),event("b","landing_view"),event("a","landing_view"),event("a","checkout_started")],[booking("b1","b"),booking("b2","b")]);
 assert.deepEqual(result.stages.map(s=>s.count),[2,2,2,1]);assert.equal(result.observedStages.find(s=>s.key==="booking_flow_opened")?.count,0);assert.equal(result.observedStages.find(s=>s.key==="checkout_payment_started")?.count,1);
});
test("outside-window, anonymous, and cancelled bookings cannot inflate visit conversion",()=>{
 const result=buildBookingJourneyFunnel([event("a","landing_view"),event("outside","checkout_started"),{event_name:"booking_started"}],[booking("b1","outside"),booking("b2"),booking("b3","a","cancelled")]);
 assert.deepEqual(result.stages.map(s=>s.count),[1,0,0,0]);assert.equal(result.excludedActivitySessions,1);assert.equal(result.unmatchedBookings,2);assert.equal(result.overallConversionRate,0);
});
test("optional actions in different orders do not become funnel gates",()=>{
 const result=buildBookingJourneyFunnel([event("a","delivery_address_entered"),event("a","date_selected"),event("a","landing_view"),event("b","landing_view"),event("b","final_price_presented")]);
 assert.deepEqual(result.stages.map(s=>s.count),[2,2,0,0]);assert.equal(result.observedStages.find(s=>s.key==="customer_information_started")?.count,0);
 assert.equal(result.observedStages.find(s=>s.key==="delivery_address_entered")?.visitRate,0.5);
});
test("empty visitor cohort reports unavailable conversion instead of an invented rate",()=>{
 const result=buildBookingJourneyFunnel([event("outside","booking_started")],[booking("b1")]);assert.equal(result.overallConversionRate,null);assert.equal(result.largestDropOff,null);assert.ok(result.stages.every(s=>s.count===0&&s.conversionRate===null));
});
