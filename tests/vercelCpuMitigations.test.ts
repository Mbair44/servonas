import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("custom-domain website route reuses cached public website data",async()=>{
 const [page,lib]=await Promise.all([read("app/sites/domain/[domain]/page.tsx"),read("lib/businessWebsite.ts")]);
 assert.match(page,/loadPublishedBusinessWebsiteByDomain/);
 assert.doesNotMatch(page,/from\("business_website_settings"\)/);
 assert.match(lib,/unstable_cache/);
 assert.match(lib,/const loadCachedPublishedBusinessWebsiteByDomain=unstable_cache/);
 assert.match(lib,/export async function loadPublishedBusinessWebsiteByDomain/);
 assert.match(lib,/return queryPublishedBusinessWebsiteByDomain\(rawDomain,route\)/);
 assert.match(lib,/domainLookupTimeoutMs=2_500/);
 assert.match(lib,/domainLookupRetryDelayMs=150/);
});

test("custom-domain pages only 404 on confirmed missing results and render fallback on temporary failures",async()=>{
 const [sitePage,bookingPage,checkoutPage,mechanicalBullPage,fallback]=await Promise.all([
  read("app/sites/domain/[domain]/page.tsx"),
  read("app/sites/domain/[domain]/booking/page.tsx"),
  read("app/sites/domain/[domain]/booking/checkout/page.tsx"),
  read("app/sites/domain/[domain]/mechanical-bull-rental/page.tsx"),
  read("components/TemporarySiteUnavailable.tsx"),
 ]);
 assert.match(sitePage,/if\(record\.kind==="not_found"\)notFound\(\)/);
 assert.match(sitePage,/if\(record\.kind==="unavailable"\)return <TemporarySiteUnavailable/);
 assert.match(bookingPage,/if\(record\.kind==="not_found"\|\|record\.kind==="ok"&&!record\.site\.bookingSlug\)notFound\(\)/);
 assert.match(bookingPage,/if\(record\.kind==="unavailable"\)return <TemporarySiteUnavailable/);
 assert.match(checkoutPage,/if\(record\.kind==="not_found"\|\|record\.kind==="ok"&&!record\.site\.bookingSlug\)notFound\(\)/);
 assert.match(checkoutPage,/if\(record\.kind==="unavailable"\)return <TemporarySiteUnavailable/);
 assert.match(mechanicalBullPage,/if\(record\.kind==="not_found"\)notFound\(\)/);
 assert.match(mechanicalBullPage,/if\(record\.kind==="unavailable"\)return <TemporarySiteUnavailable/);
 assert.match(fallback,/>404</);
 assert.match(fallback,/This page is temporarily unavailable\./);
});

test("domain lookup classifies upstream 522s as temporary failures",async()=>{
 const lib=await read("lib/businessWebsite.ts");
 assert.match(lib,/status>=500/);
 assert.match(lib,/\?"timeout":status!==null\?"supabase_api_error":"network_error"/);
 assert.match(lib,/timeout\|timed out\|network\|fetch failed\|socket\|connection\|econn\|etimedout/i);
});

test("domain lookup retry is bounded and succeeds after one retry",async()=>{
 const lib=await read("lib/businessWebsite.ts");
 assert.match(lib,/for\(let attempt=1;attempt<=2;attempt\+\+\)/);
 assert.match(lib,/if\(!lastFailure\?\.temporary\|\|attempt===2\)break/);
 assert.match(lib,/await sleep\(domainLookupRetryDelayMs\*attempt\)/);
});

test("domain lookup retry is bounded and cannot loop indefinitely",async()=>{
 const lib=await read("lib/businessWebsite.ts");
 assert.match(lib,/return \{kind:"error" as const/);
 assert.doesNotMatch(lib,/while\s*\(/);
 assert.doesNotMatch(lib,/setInterval/);
});

test("public booking page caches its expensive shared data loader",async()=>{
 const [page,loader,availabilityRoute]=await Promise.all([read("app/book/[businessSlug]/page.tsx"),read("app/book/[businessSlug]/loadPublicBookingData.ts"),read("app/api/public-booking/[businessSlug]/rental-availability/route.ts")]);
  assert.match(loader,/export const loadPublicBookingData=unstable_cache/);
  assert.match(loader,/export const loadPublicBookingSettings=unstable_cache/);
  assert.match(loader,/revalidate:300/);
  assert.match(page,/await loadPublicBookingData\(businessSlug\)/);
  assert.doesNotMatch(loader,/getInventoryCapacityUsage/);
  assert.match(loader,/booking_blackouts/);
  assert.match(availabilityRoute,/loadPublicBookingSettings/);
});

test("rental availability narrows booking scans before loading booking items",async()=>{
 const route=await read("app/api/public-booking/[businessSlug]/rental-availability/route.ts");
 assert.match(route,/async function loadRelevantBookingItemRows/);
 assert.match(route,/from\("bookings"\)/);
 assert.match(route,/\.lt\("rental_starts_at",windowEndsAt\)/);
 assert.match(route,/\.gt\("rental_ends_at",windowStartsAt\)/);
 assert.match(route,/\.in\("booking_id",intervalBookingIds\)/);
 assert.match(route,/\.gte\("rental_date",startDate\)/);
 assert.match(route,/\.lte\("rental_date",endDate\)/);
});

test("analytics endpoints skip obvious bots and prefetch traffic",async()=>{
 const [funnel,marketing,tracker,bookingClient,flags,marketingComponent]=await Promise.all([read("app/api/public-booking/[businessSlug]/funnel/route.ts"),read("app/api/marketing/events/route.ts"),read("components/TenantBookingFunnelTracker.tsx"),read("components/PartyRentalBookingClient.tsx"),read("lib/optionalAnalytics.ts"),read("components/MarketingAnalytics.tsx")]);
 assert.match(flags,/DISABLE_OPTIONAL_ANALYTICS/);
 assert.match(flags,/NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS/);
 assert.match(funnel,/optionalAnalyticsEnabled/);
 assert.match(funnel,/if\(!optionalAnalyticsEnabled\(\)\)return new NextResponse\(null,\{status:204\}\)/);
 assert.match(funnel,/const bots=\/bot\|crawler\|spider/);
 assert.match(funnel,/const eventKeyFor=/);
 assert.match(funnel,/case "booking_started":/);
 assert.match(funnel,/if\(body\.touchSession\)/);
 assert.match(funnel,/upsert\(sessionRow,\{onConflict:"business_id,id"\}\)/);
 assert.match(marketingComponent,/publicOptionalAnalyticsEnabled/);
 assert.match(marketing,/const bots=\/bot\|crawler\|spider/);
 assert.match(marketing,/Marketing visitor event disabled/);
 assert.match(marketing,/purpose=request\.headers\.get\("purpose"\)/);
 assert.match(marketing,/new NextResponse\(null,\{status:204\}\)/);
 assert.match(tracker,/sessionTouchIntervalMs=15\*60\*1000/);
 assert.match(tracker,/publicOptionalAnalyticsEnabled/);
 assert.match(tracker,/shouldSkipEvent/);
 assert.match(tracker,/booking_started:15_000/);
  assert.doesNotMatch(bookingClient,/trackBookingFunnel\(businessSlug,"rental_availability_checked"/);
  assert.match(bookingClient,/if\(source==="adjust"\)return;/);
});

test("public shell skips auth refresh when there is no Supabase session cookie",async()=>{
 const [layout,login,signup,server]=await Promise.all([read("app/layout.tsx"),read("app/login/page.tsx"),read("app/signup/page.tsx"),read("lib/supabaseServer.ts")]);
 assert.match(server,/hasSupabaseAuthCookies/);
 assert.match(layout,/if\(hasSupabaseAuthCookies\(cookieStore\)\)/);
 assert.match(layout,/Root layout auth lookup skipped/);
 assert.match(login,/if\(hasSupabaseAuthCookies\(cookieStore\)\)try/);
 assert.match(signup,/if\(hasSupabaseAuthCookies\(cookieStore\)\)try/);
});
