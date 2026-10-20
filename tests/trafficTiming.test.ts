import test from "node:test";
import assert from "node:assert/strict";
import {getTrafficTimingAnalytics} from "../lib/marketingAttribution.ts";

test("traffic timing buckets sessions and actions in tenant local time without duplicate starts",()=>{
 const result=getTrafficTimingAnalytics({timezone:"America/Phoenix",sessions:[{id:"s1",session_started_at:"2026-01-04T02:30:00Z",utm_source:null} as any,{id:"s2",session_started_at:"2026-01-05T02:30:00Z",utm_source:null} as any],events:[{event_name:"booking_started",event_key:"a",attribution_session_id:"s1",occurred_at:"2026-01-05T02:45:00Z",booking_attribution_sessions:{}} as any,{event_name:"booking_started",event_key:"b",attribution_session_id:"s1",occurred_at:"2026-01-05T02:46:00Z",booking_attribution_sessions:{}} as any],bookings:[],source:"all"});
 assert.equal(result.weekdays[6].visits,1);assert.equal(result.weekdays[0].visits,1);assert.equal(result.weekdays[0].bookingStarts,1);assert.equal(result.heatmap[0*24+19].bookingStarts,1);
});

test("empty timing report remains explainable",()=>{const result=getTrafficTimingAnalytics({timezone:"America/Phoenix",sessions:[],events:[],bookings:[],source:"all"});assert.equal(result.smallSample,true);assert.deepEqual(result.insights,[]);assert.equal(result.weekdays.reduce((sum,day)=>sum+day.visits,0),0);});

test("created and paid bookings use their own timestamps and paid qualification",()=>{
 const result=getTrafficTimingAnalytics({timezone:"America/Phoenix",sessions:[{id:"s1",session_started_at:"2026-01-05T18:00:00Z"} as any],events:[],bookings:[
  {booking_id:"unpaid",status:"pending_payment",created_at:"2026-01-05T19:00:00Z",total_cents:10000,booking_attribution_snapshots:{}},
  {booking_id:"paid",status:"confirmed",created_at:"2026-01-05T20:00:00Z",paid_at:"2026-01-06T20:00:00Z",amount_paid_cents:2500,total_cents:10000,booking_attribution_snapshots:{}},
 ],paidBookings:[
  {booking_id:"paid",status:"confirmed",created_at:"2026-01-05T20:00:00Z",paid_at:"2026-01-06T20:00:00Z",amount_paid_cents:2500,total_cents:10000,booking_attribution_snapshots:{}},
  {booking_id:"cancelled",status:"cancelled",paid_at:"2026-01-06T21:00:00Z",amount_paid_cents:2500,total_cents:10000,booking_attribution_snapshots:{}},
  {booking_id:"missing-payment",status:"confirmed",paid_at:null,amount_paid_cents:2500,total_cents:10000,booking_attribution_snapshots:{}},
 ],source:"all"});
 assert.equal(result.weekdays.reduce((sum,row)=>sum+row.bookingsCreated,0),2);
 assert.equal(result.weekdays.reduce((sum,row)=>sum+row.paidBookings,0),1);
 assert.equal(result.weekdays.reduce((sum,row)=>sum+row.paidBookedValueCents,0),10000);
});

test("paid bookings are deduplicated and tenant data is caller scoped",()=>{
 const result=getTrafficTimingAnalytics({timezone:"America/Phoenix",sessions:[],events:[],bookings:[],paidBookings:[
  {booking_id:"same",status:"paid",paid_at:"2026-01-06T20:00:00Z",amount_paid_cents:1,total_cents:7000,booking_attribution_snapshots:{}},
  {booking_id:"same",status:"paid",paid_at:"2026-01-06T20:00:00Z",amount_paid_cents:7000,total_cents:7000,booking_attribution_snapshots:{}},
 ],source:"all"});
 assert.equal(result.weekdays.reduce((sum,row)=>sum+row.paidBookings,0),1);
 assert.equal(result.weekdays.reduce((sum,row)=>sum+row.paidBookedValueCents,0),7000);
});
