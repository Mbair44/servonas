import assert from "node:assert/strict";
import test from "node:test";
import {buildDirectTrafficInsights} from "../lib/directTrafficInsights.ts";

const at="2026-10-14T12:00:00.000Z";
const touch=(source:string,time="2026-10-13T12:00:00.000Z")=>({source,occurred_at:time});
const session=(id:string,visitor_id?:string)=>({id,visitor_id,session_started_at:at});
const report=(input:Parameters<typeof buildDirectTrafficInsights>[0])=>Object.fromEntries(buildDirectTrafficInsights(input).map(row=>[row.category,row]));

test("Direct insights retain current Direct sessions and reconcile every session exactly once",()=>{
 const rows=report({sessions:[session("meta","v1"),session("google","v2"),session("gbp","v3"),session("organic","v4"),session("plain","v5"),session("declined")],visitors:[{visitor_id:"v1",first_touch:touch("meta_ads"),last_non_direct_touch:touch("meta_ads")},{visitor_id:"v2",first_touch:touch("google_ads"),last_non_direct_touch:touch("google_ads")},{visitor_id:"v3",first_touch:touch("google_business_profile"),last_non_direct_touch:touch("google_business_profile")},{visitor_id:"v4",first_touch:touch("organic"),last_non_direct_touch:touch("organic")},{visitor_id:"v5",first_touch:touch("direct")}],events:[],bookings:[]});
 assert.equal(Object.values(rows).reduce((sum,row)=>sum+row.visits,0),6);
 assert.equal(rows.meta_ads.visits,1);assert.equal(rows.google_ads.visits,1);assert.equal(rows.google_business_profile.visits,1);assert.equal(rows.organic.visits,1);assert.equal(rows.direct_no_prior.visits,1);assert.equal(rows.unknown.visits,1);
});

test("Direct insights deduplicate interest, checkout, and booking revenue without cross-tenant-style ID leakage",()=>{
 const rows=report({sessions:[session("direct-return","visitor")],visitors:[{visitor_id:"visitor",first_touch:touch("google_ads"),last_non_direct_touch:touch("google_ads")}],events:[{attribution_session_id:"direct-return",event_name:"booking_started"},{attribution_session_id:"direct-return",event_name:"checkout_started"},{attribution_session_id:"direct-return",event_name:"checkout_started"},{attribution_session_id:"another-session",event_name:"checkout_started"}],bookings:[{booking_id:"one",status:"confirmed",total_cents:12000,attribution_session_id:"direct-return"},{booking_id:"one",status:"confirmed",total_cents:12000,attribution_session_id:"direct-return"},{booking_id:"two",status:"confirmed",total_cents:5000,attribution_session_id:"another-session"}]});
 assert.deepEqual(rows.google_ads,{category:"google_ads",label:"Returning from Google Ads",visits:1,bookingInterest:1,checkoutStarts:1,completedBookings:1,revenueCents:12000});
});

test("Direct insights retain legacy checkout and promotion event aliases",()=>{
 const rows=report({sessions:[session("direct-return","visitor")],visitors:[{visitor_id:"visitor",first_touch:touch("meta_ads"),last_non_direct_touch:touch("meta_ads")}],events:[{attribution_session_id:"direct-return",event_name:"promotion_primary_cta_clicked"},{attribution_session_id:"direct-return",event_name:"initiate_checkout"}],bookings:[]});
 assert.equal(rows.meta_ads.bookingInterest,1);assert.equal(rows.meta_ads.checkoutStarts,1);
});

test("expired, missing, and post-session history is unknown rather than guessed",()=>{
 const rows=report({sessions:[session("expired","a"),session("missing","b"),session("future","c")],visitors:[{visitor_id:"a",first_touch:touch("meta_ads","2026-08-01T00:00:00.000Z"),last_non_direct_touch:touch("meta_ads","2026-08-01T00:00:00.000Z")},{visitor_id:"c",first_touch:touch("google_ads","2026-10-15T00:00:00.000Z"),last_non_direct_touch:touch("google_ads","2026-10-15T00:00:00.000Z")}],events:[],bookings:[]});
 assert.equal(rows.unknown.visits,3);
});
