import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("booking funnel route persists service_id and structured diagnostics",async()=>{
 const route=await read("app/api/public-booking/[businessSlug]/funnel/route.ts");
 assert.match(route,/const diagnosticsEnabled=\(\)=>process\.env\.BOOKING_FUNNEL_DIAGNOSTICS==="1"/);
 assert.match(route,/const serviceId=clean\(body\.serviceId,100\)\|\|clean\(metadata\.service_id,100\)\|\|null/);
 assert.match(route,/service_id:serviceId/);
 assert.match(route,/stage:"session_upsert"/);
 assert.match(route,/stage:"event_insert"/);
 assert.match(route,/hasFbclid:Boolean\(attribution\.fbclid\)/);
 assert.match(route,/bookingSettings\?\.business_id/);
 assert.match(route,/business_website_settings/);
 assert.match(route,/\.eq\("status","published"\)/);
});

test("booking tracker payload can carry service identifiers for service funnels",async()=>{
 const tracker=await read("components/TenantBookingFunnelTracker.tsx");
 const bookingForm=await read("components/PublicBookingForm.tsx");
 const requestForm=await read("components/WebsiteRequestForm.tsx");
 assert.match(tracker,/type TrackBookingFunnelOptions=\{inventoryItemId\?:string;serviceId\?:string;metadata\?:Record<string,unknown>;touchOnly\?:boolean\}/);
 assert.match(tracker,/serviceId:options\.serviceId/);
 assert.match(bookingForm,/trackBookingFunnel\(props\.publicSlug,"service_view",\{serviceId/);
 assert.match(tracker,/const isEmbeddedBooking=\(\)=>new URLSearchParams\(location\.search\)\.get\("embed"\)==="1";/);
 assert.match(tracker,/pageTypeForPath\(location\.pathname\)==="booking"&&!isEmbeddedBooking\(\)/);
 assert.match(bookingForm,/if\(!props\.embedded\)trackBookingFunnel\(props\.publicSlug,"booking_started",\{metadata:\{surface:"public_booking_form",entry:"booking_page"\}\}\)/);
 assert.match(bookingForm,/trackBookingFunnel\(props\.publicSlug,"availability_check",\{serviceId/);
 assert.match(requestForm,/trackBookingFunnel\(businessSlug,"service_view",\{serviceId:event\.target\.value/);
});

test("booking tracker decorates both embedded and full booking URLs with the stored attribution session and params",async()=>{
 const tracker=await read("components/TenantBookingFunnelTracker.tsx");
 assert.match(tracker,/const bookingPathFor=\(slug:string\)=>`\/book\/\$\{encodeURIComponent\(slug\)\}`;/);
 assert.match(tracker,/const bookingCheckoutPathFor=\(slug:string\)=>`\$\{bookingPathFor\(slug\)\}\/booking`;/);
 assert.match(tracker,/pathname===bookingPathFor\(slug\)\|\|pathname===bookingCheckoutPathFor\(slug\)\|\|pathname==="\/booking"\|\|pathname==="\/booking\/checkout"/);
 assert.match(tracker,/if\(!url\.searchParams\.has\("sv_at"\)\)url\.searchParams\.set\("sv_at",state\.sessionId\);/);
 assert.match(tracker,/for\(const \[key,value\] of Object\.entries\(state\.attribution\)\)if\(value&&!url\.searchParams\.has\(key\)\)url\.searchParams\.set\(key,value\);/);
 assert.match(tracker,/querySelectorAll<HTMLAnchorElement\|HTMLIFrameElement>\("a\[href\],iframe\[src\]"\)/);
 assert.match(tracker,/trackBookingFunnel\(businessSlug,"session_heartbeat"/);
 assert.match(tracker,/touchOnly:true/);
 assert.match(tracker,/session_duration_increment_seconds:elapsedSeconds/);
 assert.match(tracker,/engaged_duration_increment_seconds:elapsedSeconds/);
});

test("booking attribution migration preserves fbclid and immutable landing metadata on snapshots",async()=>{
 const migration=await read("supabase/migrations/20260830000100_booking_funnel_meta_attribution_backfill.sql");
 const funnelPage=await read("app/app/[businessSlug]/marketing/funnel/page.tsx");
 const bookingFunnel=await read("lib/bookingFunnel.ts");
 assert.match(migration,/add column if not exists fbclid text/);
 assert.match(migration,/add column if not exists first_landing_url text/);
 assert.match(migration,/update public\.booking_attribution_snapshots snapshots/);
 assert.match(bookingFunnel,/select\("id,first_landing_url,first_landing_path,first_referrer,gclid,gbraid,wbraid,fbclid,utm_source,utm_medium,utm_campaign,utm_content,utm_term"\)/);
 assert.match(funnelPage,/booking_attribution_sessions\(utm_source,utm_medium,utm_campaign,utm_content,utm_term,first_referrer,first_landing_url,first_landing_path,gclid,gbraid,wbraid,fbclid\)/);
  assert.match(funnelPage,/booking_attribution_snapshots\(first_referrer,first_landing_url,first_landing_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,gbraid,wbraid,fbclid\)/);
});

test("booking funnel route updates session metrics without inflating event counts",async()=>{
 const route=await read("app/api/public-booking/[businessSlug]/funnel/route.ts");
 const migration=await read("supabase/migrations/20260831000400_booking_funnel_session_engagement.sql");
 assert.match(route,/touchOnly:Boolean\(body\.touchOnly\)/);
 assert.match(route,/if\(body\.touchOnly\|\|event==="session_heartbeat"\)return new NextResponse\(null,\{status:204\}\);/);
 assert.match(route,/total_session_duration_seconds/);
 assert.match(route,/engaged_duration_seconds/);
 assert.match(route,/page_count/);
 assert.match(route,/engaged_page_count/);
 assert.match(migration,/add column if not exists total_session_duration_seconds integer not null default 0/);
 assert.match(migration,/add column if not exists engaged_duration_seconds integer not null default 0/);
});
