import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("custom-domain website route reuses cached public website data",async()=>{
 const [page,lib]=await Promise.all([read("app/sites/domain/[domain]/page.tsx"),read("lib/businessWebsite.ts")]);
 assert.match(page,/loadPublishedBusinessWebsiteByDomain/);
 assert.doesNotMatch(page,/from\("business_website_settings"\)/);
 assert.match(lib,/unstable_cache/);
 assert.match(lib,/export const loadPublishedBusinessWebsiteByDomain=unstable_cache/);
});

test("public booking page caches its expensive shared data loader",async()=>{
 const [page,loader]=await Promise.all([read("app/book/[businessSlug]/page.tsx"),read("app/book/[businessSlug]/loadPublicBookingData.ts")]);
 assert.match(loader,/export const loadPublicBookingData=unstable_cache/);
 assert.match(loader,/revalidate:300/);
 assert.match(page,/await loadPublicBookingData\(businessSlug\)/);
 assert.doesNotMatch(loader,/getInventoryCapacityUsage/);
 assert.match(loader,/booking_blackouts/);
});

test("analytics endpoints skip obvious bots and prefetch traffic",async()=>{
 const [funnel,marketing,tracker,bookingClient]=await Promise.all([read("app/api/public-booking/[businessSlug]/funnel/route.ts"),read("app/api/marketing/events/route.ts"),read("components/TenantBookingFunnelTracker.tsx"),read("components/PartyRentalBookingClient.tsx")]);
 assert.match(funnel,/const bots=\/bot\|crawler\|spider/);
 assert.match(funnel,/if\(body\.touchSession\)/);
 assert.match(funnel,/upsert\(sessionRow,\{onConflict:"business_id,id"\}\)/);
 assert.match(marketing,/const bots=\/bot\|crawler\|spider/);
 assert.match(marketing,/prefetch/i);
 assert.match(tracker,/sessionTouchIntervalMs=15\*60\*1000/);
 assert.match(tracker,/shouldSkipEvent/);
 assert.match(bookingClient,/trackedAvailabilityChecks/);
 assert.match(bookingClient,/if\(source==="adjust"\)return;/);
});
