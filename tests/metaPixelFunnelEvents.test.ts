import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("meta pixel helper defaults enabled sites to measurement while honoring explicit opt-out and preserving dedupe",async()=>{
 const component=await read("components/TenantMetaPixel.tsx");
 assert.match(component,/export function trackMetaStandardEvent/);
 assert.match(component,/const measurementAllowed=\(\)=>/);
 assert.match(component,/consent!=="denied"&&\(consent==="granted"\|\|window\.__servonasMetaDefaultMeasurementEnabled===true\)/);
 assert.match(component,/activeMetaPixelId=\(\)=>typeof window==="undefined"\?null:validPixelId\(window\.__servonasMetaPixelId\?\?"\"\)/);
 assert.match(component,/pathBlocked=\(pathname:string\)=>pathname\.startsWith\("\/app"\)\|\|pathname\.startsWith\("\/tech"\)\|\|pathname\.startsWith\("\/sites\/preview"\)/);
 assert.match(component,/rememberMetaEvent/);
 assert.match(component,/window\.fbq\("track",event,sanitizeMetaParams\(params\),\{eventID:eventId\}\)/);
 assert.match(component,/export function trackMetaBrowserAndServerEvent/);
});

test("Thanksgiving mounts the tenant pixel and booking tracker before the special landing",async()=>{
 const route=await read("app/sites/domain/[domain]/[promotionSlug]/page.tsx");
 assert.match(route,/promotionSlug==="thanksgiving"[\s\S]*?<TenantMetaPixel pixelId=\{site\.metaPixelId\} defaultMeasurementEnabled=\{Boolean\(site\.metaPixelDefaultMeasurementEnabled\)\}/);
 assert.match(route,/promotionSlug==="thanksgiving"[\s\S]*?<TenantBookingFunnelTracker businessSlug=\{site\.bookingSlug\} defaultMeasurementEnabled=\{Boolean\(site\.metaPixelDefaultMeasurementEnabled\)\} landingType="promotion" landingLabel="thanksgiving"/);
});

test("booking attribution survives regardless of analytics consent",async()=>{
 const [tracker,website]=await Promise.all([read("components/TenantBookingFunnelTracker.tsx"),read("components/BusinessWebsite.tsx")]);
 assert.doesNotMatch(tracker,/applyStoredAttribution = \(url: URL, slug: string\) => \{ if\(!analyticsAllowed\(\)\)/);
 assert.match(tracker,/a\[href\],iframe\[src\]/);
 assert.match(tracker,/url\.searchParams\.set\("sv_at", state\.sessionId\)/);
 assert.match(website,/EmbeddedBookingFrame src=\{`\$\{bookingBaseUrl\}/);
});

test("rental booking flow maps view content initiate checkout and purchase to canonical public interactions",async()=>{
 const [rental,domainBookingRoute]=await Promise.all([
  read("components/PartyRentalBookingClient.tsx"),
  read("app/sites/domain/[domain]/booking/page.tsx"),
 ]);
 assert.doesNotMatch(domainBookingRoute,/trackMetaStandardEvent\("ViewContent"/);
 assert.doesNotMatch(domainBookingRoute,/trackMetaStandardEvent\("InitiateCheckout"/);
 assert.match(rental,/trackMetaStandardEvent\("ViewContent"/);
 assert.match(rental,/eventKey:`view-content:\$\{businessSlug\}:\$\{item\.id\}`/);
 assert.match(rental,/if\(source==="browse"\)/);
 assert.match(rental,/onClick=\{event=>\{[^}]*noteInventoryInteraction\(item,"browse"\);\}\}/);
 assert.doesNotMatch(rental,/useEffect\([^)]*trackMetaStandardEvent\("ViewContent"/s);
 assert.match(rental,/trackMetaBrowserAndServerEvent\(businessSlug,"InitiateCheckout"/);
 assert.match(rental,/checkoutTransitionRef\.current/);
 assert.match(rental,/meta_event_id/);
 assert.match(rental,/function showReservationPage/);
 assert.match(rental,/function goToCart\(\)\{openCheckout\(\);\}/);
 assert.match(rental,/trackMetaStandardEvent\("Purchase"/);
 assert.match(rental,/const eventId=`purchase-\$\{invoiceLaterConfirmation\.bookingId\}`/);
 assert.match(rental,/storage:"local"/);
});

test("public booking forms and success pages track meta purchases only on authoritative completion surfaces",async()=>{
 const [form,bookingSuccess,stripeSuccess,purchaseTracker]=await Promise.all([
  read("components/PublicBookingForm.tsx"),
  read("app/book/[businessSlug]/success/page.tsx"),
  read("components/StripeCheckoutSuccess.tsx"),
  read("components/TenantMetaPixelPurchaseTracker.tsx"),
 ]);
 assert.match(form,/trackMetaBrowserAndServerEvent\(props\.publicSlug,"InitiateCheckout"/);
 assert.doesNotMatch(form,/useEffect\([^)]*trackMetaStandardEvent\("InitiateCheckout"/s);
 assert.match(bookingSuccess,/meta_pixel_id/);
 assert.match(bookingSuccess,/TenantMetaPixel pixelId=\{metaPixelId\}/);
 assert.match(bookingSuccess,/job\.status==="confirmed"&&<TenantMetaPixelPurchaseTracker bookingId=\{submission\.id\} businessSlug=\{businessSlug\}/);
 assert.match(stripeSuccess,/meta_pixel_id/);
 assert.match(stripeSuccess,/TenantMetaPixel pixelId=\{metaPixelId\}/);
 assert.match(stripeSuccess,/TenantMetaPixelPurchaseTracker bookingId=\{bookingId\}/);
 assert.match(purchaseTracker,/trackMetaStandardEvent\("Purchase"/);
 assert.match(purchaseTracker,/const eventId=`purchase-\$\{bookingId\}`/);
 assert.match(purchaseTracker,/storage:"local"/);
});

test("mechanical bull landing uses the tenant pixel for item-detail view content on the custom-domain landing",async()=>{
 const [route,landing]=await Promise.all([
  read("app/sites/domain/[domain]/mechanical-bull-rental/page.tsx"),
  read("components/MechanicalBullLanding.tsx"),
 ]);
 assert.match(route,/record\.site\.metaPixelId&&<TenantMetaPixel pixelId=\{record\.site\.metaPixelId\} defaultMeasurementEnabled=\{Boolean\(record\.site\.metaPixelDefaultMeasurementEnabled\)\}\/>/);
 assert.match(landing,/trackMetaStandardEvent\("ViewContent"/);
 assert.match(landing,/eventKey:`view-content:\$\{data\.bookingSlug\}:\$\{item\.id\}:mechanical-bull`/);
});

test("custom-domain booking and real checkout load only the resolved tenant pixel",async()=>{
 const [booking,checkout]=await Promise.all([read("app/sites/domain/[domain]/booking/page.tsx"),read("app/sites/domain/[domain]/booking/checkout/page.tsx")]);
 for(const route of [booking,checkout]){
  assert.match(route,/import \{TenantMetaPixel\} from "@\/components\/TenantMetaPixel"/);
  assert.match(route,/record\.site\.metaPixelId&&<TenantMetaPixel pixelId=\{record\.site\.metaPixelId\} defaultMeasurementEnabled=\{Boolean\(record\.site\.metaPixelDefaultMeasurementEnabled\)\}\/>/);
  assert.doesNotMatch(route,/2375527282981645/);
 }
});
