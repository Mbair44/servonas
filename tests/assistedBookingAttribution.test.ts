import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../lib/assistedBookingAttribution.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20260925000200_assisted_booking_attribution.sql",import.meta.url),"utf8");
test("tracked assisted bookings copy only the selected tenant session",()=>{assert.match(source,/eq\("business_id",input\.businessId\)\.eq\("id",input\.attribution\.sessionId\)/);assert.match(source,/const \{id:sessionId,\.\.\.snapshot\}=session/);assert.match(source,/attribution_evidence:\"tracked_session\"/);assert.match(source,/recovered_from_booking_id/);assert.match(source,/recovered_from_attribution_session_id/);});
test("manual Meta attribution stays channel-only and never fabricates a resource",()=>{assert.match(source,/meta_ads:\{utm_source:\"facebook\",utm_medium:\"paid_social\"\}/);assert.match(source,/attribution_evidence:\"customer_reported\"/);assert.doesNotMatch(source,/campaign_id|adset_id|ad_id/);});
test("assisted attribution has durable recovery fields",()=>{assert.match(migration,/conversion_method/);assert.match(migration,/recovered_from_booking_id/);assert.match(migration,/attribution_evidence/);});
