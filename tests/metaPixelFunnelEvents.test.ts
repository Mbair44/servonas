import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("meta pixel helper keeps funnel events consent-aware and deduped",async()=>{
 const component=await read("components/TenantMetaPixel.tsx");
 assert.match(component,/export function trackMetaStandardEvent/);
 assert.match(component,/consentGranted=\(\)=>typeof window!=="undefined"&&window\.localStorage\.getItem\(CONSENT_KEY\)==="granted"/);
 assert.match(component,/activeMetaPixelId=\(\)=>typeof window==="undefined"\?null:validPixelId\(window\.__servonasMetaPixelId\?\?"\"\)/);
 assert.match(component,/pathBlocked=\(pathname:string\)=>pathname\.startsWith\("\/app"\)\|\|pathname\.startsWith\("\/tech"\)\|\|pathname\.startsWith\("\/sites\/preview"\)/);
 assert.match(component,/rememberMetaEvent/);
 assert.match(component,/window\.fbq\("track",event,sanitizeMetaParams\(params\)\)/);
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
 assert.match(rental,/onClick=\{\(\)=>noteInventoryInteraction\(item,"browse"\)\}/);
 assert.doesNotMatch(rental,/useEffect\([^)]*trackMetaStandardEvent\("ViewContent"/s);
 assert.match(rental,/trackMetaStandardEvent\("InitiateCheckout"/);
 assert.match(rental,/eventKey:`initiate-checkout:\$\{businessSlug\}:/);
 assert.match(rental,/function showReservationPage/);
 assert.match(rental,/function goToCart\(\)\{openCheckout\(\);\}/);
 assert.match(rental,/trackMetaStandardEvent\("Purchase"/);
 assert.match(rental,/eventKey:`purchase:\$\{invoiceLaterConfirmation\.bookingId\}`/);
 assert.match(rental,/storage:"local"/);
});

test("public booking forms and success pages track meta purchases only on authoritative completion surfaces",async()=>{
 const [form,bookingSuccess,stripeSuccess,purchaseTracker]=await Promise.all([
  read("components/PublicBookingForm.tsx"),
  read("app/book/[businessSlug]/success/page.tsx"),
  read("app/success/page.tsx"),
  read("components/TenantMetaPixelPurchaseTracker.tsx"),
 ]);
 assert.match(form,/trackMetaStandardEvent\("InitiateCheckout"/);
 assert.match(form,/eventKey:`initiate-checkout:\$\{props\.publicSlug\}:\$\{serviceId\}:\$\{date\}:\$\{time\}`/);
 assert.doesNotMatch(form,/useEffect\([^)]*trackMetaStandardEvent\("InitiateCheckout"/s);
 assert.match(bookingSuccess,/meta_pixel_id/);
 assert.match(bookingSuccess,/TenantMetaPixel pixelId=\{metaPixelId\}/);
 assert.match(bookingSuccess,/TenantMetaPixelPurchaseTracker bookingId=\{submission\.id\} contentIds=\{\[service\.id\]\}/);
 assert.match(stripeSuccess,/meta_pixel_id/);
 assert.match(stripeSuccess,/TenantMetaPixel pixelId=\{metaPixelId\}/);
 assert.match(stripeSuccess,/TenantMetaPixelPurchaseTracker bookingId=\{bookingId\}/);
 assert.match(purchaseTracker,/trackMetaStandardEvent\("Purchase"/);
 assert.match(purchaseTracker,/storage:"local"/);
});

test("mechanical bull landing uses the tenant pixel for item-detail view content on the custom-domain landing",async()=>{
 const [route,landing]=await Promise.all([
  read("app/sites/domain/[domain]/mechanical-bull-rental/page.tsx"),
  read("components/MechanicalBullLanding.tsx"),
 ]);
 assert.match(route,/record\.site\.metaPixelId&&<TenantMetaPixel pixelId=\{record\.site\.metaPixelId\}\/>/);
 assert.match(landing,/trackMetaStandardEvent\("ViewContent"/);
 assert.match(landing,/eventKey:`view-content:\$\{data\.bookingSlug\}:\$\{item\.id\}:mechanical-bull`/);
});

test("custom-domain booking and real checkout load only the resolved tenant pixel",async()=>{
 const [booking,checkout]=await Promise.all([read("app/sites/domain/[domain]/booking/page.tsx"),read("app/sites/domain/[domain]/booking/checkout/page.tsx")]);
 for(const route of [booking,checkout]){
  assert.match(route,/import \{TenantMetaPixel\} from "@\/components\/TenantMetaPixel"/);
  assert.match(route,/record\.site\.metaPixelId&&<TenantMetaPixel pixelId=\{record\.site\.metaPixelId\}\/>/);
  assert.doesNotMatch(route,/2375527282981645/);
 }
});
