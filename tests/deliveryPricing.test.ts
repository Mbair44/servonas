import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {calculateDeliveryPrice,validateDeliverySettings,type DeliveryPricingSettings} from "../lib/deliveryPricing.ts";

const tiers:DeliveryPricingSettings={enabled:true,pricingMethod:"distance_tiers",freeRadiusMiles:20,tiers:[{upToMiles:30,feeCents:2500},{upToMiles:40,feeCents:5000},{upToMiles:50,feeCents:7500},{upToMiles:60,feeCents:10000}],perMileRateCents:0,minimumFeeCents:0,maximumDistanceMiles:60,outsideAreaAction:"request_quote",longDistanceFeeCents:0};

test("delivery is free inside and at the free-radius boundary",()=>{assert.equal(calculateDeliveryPrice(12,tiers).feeCents,0);assert.equal(calculateDeliveryPrice(20,tiers).feeCents,0);});
test("each paid tier includes its upper boundary",()=>{assert.equal(calculateDeliveryPrice(21,tiers).feeCents,2500);assert.equal(calculateDeliveryPrice(30,tiers).feeCents,2500);assert.equal(calculateDeliveryPrice(37,tiers).feeCents,5000);assert.equal(calculateDeliveryPrice(45,tiers).feeCents,7500);assert.equal(calculateDeliveryPrice(60,tiers).feeCents,10000);});
test("outside radius requests a quote",()=>{const result=calculateDeliveryPrice(60.1,tiers);assert.equal(result.eligible,false);assert.equal(result.requiresQuote,true);});
test("per-mile pricing subtracts the free radius",()=>{const result=calculateDeliveryPrice(37,{...tiers,pricingMethod:"per_mile",perMileRateCents:200,minimumFeeCents:0});assert.equal(result.feeCents,3400);});
test("per-mile pricing honors the minimum charge",()=>{const result=calculateDeliveryPrice(21,{...tiers,pricingMethod:"per_mile",perMileRateCents:200,minimumFeeCents:2500});assert.equal(result.feeCents,2500);});
test("invalid overlapping or oversized tiers are rejected",()=>{assert.ok(validateDeliverySettings({...tiers,tiers:[{upToMiles:30,feeCents:2500},{upToMiles:30,feeCents:5000}]}));assert.ok(validateDeliverySettings({...tiers,maximumDistanceMiles:25}));});
test("mapping failure never silently becomes free delivery",async()=>{const source=await readFile(new URL("../lib/deliveryQuote.ts",import.meta.url),"utf8");assert.match(source,/We couldn't calculate delivery for this address yet/);assert.doesNotMatch(source,/route_unavailable.*feeCents:0/s);});
test("checkout calculates delivery server-side and excludes it from discount input",async()=>{const source=await readFile(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8");assert.match(source,/quoteBusinessDelivery\(supabase,business\.id,verifiedDestination\)/);assert.match(source,/authoritativeItems=pricedItems/);assert.match(source,/totalCents=Math\.max\(0,subtotalCents-discountCents\)\+deliveryFeeCents/);assert.doesNotMatch(source,/body\.deliveryFee/);});
test("bookings retain immutable delivery snapshots and override audit fields",async()=>{const migration=await readFile(new URL("../supabase/migrations/20260908000200_delivery_fees_service_area.sql",import.meta.url),"utf8");for(const column of ["delivery_origin_snapshot","delivery_destination_snapshot","delivery_rule_snapshot","delivery_fee_original_cents","delivery_fee_overridden_by","delivery_fee_override_reason"])assert.match(migration,new RegExp(column));});
test("origin changes invalidate cached origin coordinates",async()=>{const action=await readFile(new URL("../app/app/[businessSlug]/booking/actions.ts",import.meta.url),"utf8");assert.match(action,/addressChanged\?\{origin_place_id:null,origin_latitude:null,origin_longitude:null\}/);});
test("manual override preserves original fee and records an analytics event",async()=>{const action=await readFile(new URL("../app/app/[businessSlug]/jobs/actions.ts",import.meta.url),"utf8");assert.match(action,/delivery_fee_cents:feeCents/);assert.doesNotMatch(action,/delivery_fee_original_cents:feeCents/);assert.match(action,/event_name:"delivery_fee_overridden"/);});

const time:DeliveryPricingSettings={...tiers,pricingMethod:"time_tiers",timeTiers:[{upToMinutes:20,feeCents:0},{upToMinutes:30,feeCents:2500}],maximumDriveMinutes:30};
test("time tiers use exact drive seconds and include upper boundaries",()=>{
 for(const [seconds,fee] of [[0,0],[1199,0],[1200,0],[1201,2500],[1800,2500]])assert.equal(calculateDeliveryPrice(100,time,seconds).feeCents,fee);
 assert.equal(calculateDeliveryPrice(1,time,1801).requiresQuote,true);
});
test("time pricing ignores saved mileage limits and free radius",()=>{
 assert.equal(calculateDeliveryPrice(1,time,1500).feeCents,2500);
 assert.equal(calculateDeliveryPrice(100,time,600).feeCents,0);
 assert.equal(calculateDeliveryPrice(30,{...time,pricingMethod:"distance_tiers"},600).feeCents,2500);
});
test("missing or invalid duration never becomes free delivery",()=>{
 for(const seconds of [undefined,null,NaN,Infinity,-1])assert.throws(()=>calculateDeliveryPrice(1,time,seconds),/Driving time is unavailable/);
});
test("time service limit supports blocking and fixed outside-area fees",()=>{
 assert.equal(calculateDeliveryPrice(1,{...time,outsideAreaAction:"block"},1801).eligible,false);
 const result=calculateDeliveryPrice(1,{...time,outsideAreaAction:"long_distance_fee",longDistanceFeeCents:9000},1801);
 assert.equal(result.eligible,true);assert.equal(result.insideServiceArea,false);assert.equal(result.feeCents,9000);
 assert.equal(calculateDeliveryPrice(1,{...time,maximumDriveMinutes:null},1801).requiresQuote,true);
});
test("time tier validation rejects duplicate limits, missing tiers, invalid fees and too-small maximums",()=>{
 assert.equal(validateDeliverySettings(time),null);
 for(const change of [{timeTiers:[]},{timeTiers:[{upToMinutes:20,feeCents:0},{upToMinutes:20,feeCents:2500}]},{timeTiers:[{upToMinutes:20,feeCents:-1}]},{maximumDriveMinutes:25},{maximumDriveMinutes:NaN}])assert.ok(validateDeliverySettings({...time,...change}));
});
test("time quotes retain the applied tier and authoritative duration",()=>{
 const result=calculateDeliveryPrice(12,time,1501);
 assert.deepEqual(result.ruleSnapshot,{type:"time_tier",overMinutes:20,upToMinutes:30,durationSeconds:1501,feeCents:2500});
});
