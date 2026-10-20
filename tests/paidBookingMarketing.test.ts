import test from "node:test";
import assert from "node:assert/strict";
import {buildSourcePerformanceReport,paidBookingCountsForAnalytics} from "../lib/marketingAttribution.ts";

const google={utm_source:"google",utm_medium:"cpc",gclid:"click"};

test("source reporting keeps created bookings separate from paid bookings",()=>{
 const created=[
  {booking_id:"unpaid",status:"pending_payment",total_cents:12000,created_at:"2026-01-05T20:00:00Z",booking_attribution_snapshots:google},
  {booking_id:"paid",status:"confirmed",total_cents:16000,created_at:"2026-01-05T20:00:00Z",booking_attribution_snapshots:google},
 ];
 const paid=[
  {booking_id:"paid",status:"confirmed",total_cents:16000,amount_paid_cents:4000,paid_at:"2026-01-06T20:00:00Z",booking_attribution_snapshots:google},
  {booking_id:"refunded",status:"refunded",total_cents:9000,amount_paid_cents:9000,paid_at:"2026-01-06T20:00:00Z",booking_attribution_snapshots:google},
 ];
 const report=buildSourcePerformanceReport([],created,{google_ads:5000},[],paid);
 const row=report.summaries.find(row=>row.source==="google_ads")!;
 assert.equal(row.bookingsCreated,2);
 assert.equal(row.paidBookings,1);
 assert.equal(row.revenueCents,16000);
 assert.equal(row.roas,3.2);
});

test("paid qualification excludes canceled, refunded, zero-payment, and missing-payment bookings",()=>{
 for(const booking of [
  {status:"cancelled",amount_paid_cents:100,paid_at:"2026-01-01"},
  {status:"refunded",amount_paid_cents:100,paid_at:"2026-01-01"},
  {status:"confirmed",amount_paid_cents:0,paid_at:"2026-01-01"},
  {status:"confirmed",amount_paid_cents:100,paid_at:null},
 ])assert.equal(paidBookingCountsForAnalytics(booking),false);
 assert.equal(paidBookingCountsForAnalytics({status:"completed",amount_paid_cents:1,paid_at:"2026-01-01"}),true);
});
