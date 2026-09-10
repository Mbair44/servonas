import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createMetaEventId} from "../lib/metaEventId.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("each real checkout attempt receives a distinct Meta event ID",()=>{
 const ids=new Set(Array.from({length:100},()=>createMetaEventId("InitiateCheckout")));
 assert.equal(ids.size,100);
 for(const id of ids)assert.match(id,/^initiatecheckout-[0-9a-f-]{36}$/);
});

test("InitiateCheckout shares one action event ID across Pixel and CAPI",async()=>{
 const [pixel,route,sender]=await Promise.all([
  read("components/TenantMetaPixel.tsx"),
  read("app/api/public-booking/[businessSlug]/meta-event/route.ts"),
  read("lib/metaConversions.ts"),
 ]);
 assert.match(pixel,/createMetaEventId\(event\)/);
 assert.match(pixel,/\{eventID:eventId\}/);
 assert.match(pixel,/JSON\.stringify\(\{event,eventId,/);
 assert.match(route,/eventId=clean\(body\?\.eventId/);
 assert.match(route,/sendMetaConversion\(\{businessId,businessSlug,pixelId,event,eventId/);
 assert.match(sender,/event_id:input\.eventId/);
});

test("browser and server independently suppress duplicate delivery",async()=>{
 const [pixel,sender,migration]=await Promise.all([
  read("components/TenantMetaPixel.tsx"),
  read("lib/metaConversions.ts"),
  read("supabase/migrations/20260907000100_meta_conversion_event_dedup.sql"),
 ]);
 assert.match(pixel,/rememberMetaEvent\(dedupeValue/);
 assert.match(pixel,/__servonasMetaServerEventKeys/);
 assert.match(sender,/claimError\?\.code==="23505"/);
 assert.match(migration,/unique \(business_id,event_name,event_id\)/);
});

test("rental checkout creates a fresh ID only at the real checkout transition",async()=>{
 const [rental,checkout,tracker]=await Promise.all([
  read("components/PartyRentalBookingClient.tsx"),
  read("app/sites/domain/[domain]/booking/checkout/page.tsx"),
  read("components/TenantMetaInitiateCheckoutTracker.tsx"),
 ]);
 assert.match(rental,/function showReservationPage/);
 assert.match(rental,/if\(checkoutTransitionRef\.current\)return/);
 assert.match(rental,/trackMetaBrowserAndServerEvent\(businessSlug,"InitiateCheckout"/);
 assert.match(rental,/useEffect\(\(\)=>\{if\(!showCheckout\)checkoutTransitionRef\.current=false;/);
 assert.doesNotMatch(rental,/eventKey:`initiate-checkout:/);
 assert.match(checkout,/meta_event_id/);
 assert.match(checkout,/TenantMetaInitiateCheckoutTracker eventId=\{metaEventId\}/);
 assert.match(tracker,/trackMetaStandardEvent\("InitiateCheckout"/);
 assert.match(tracker,/\{eventId,storage:"session"\}/);
});

test("CAPI remains tenant scoped and never logs credentials",async()=>{
 const [route,sender]=await Promise.all([
  read("app/api/public-booking/[businessSlug]/meta-event/route.ts"),
  read("lib/metaConversions.ts"),
 ]);
 assert.match(route,/from\("business_website_settings"\).*select\("meta_pixel_id"\).*eq\("business_id",businessId\)/s);
 assert.match(sender,/META_CONVERSIONS_API_ACCESS_TOKENS/);
 assert.match(sender,/configuredPixel===pixelId/);
 assert.doesNotMatch(sender,/!configuredPixel\|\|configuredPixel===pixelId/);
 assert.match(sender,/authorization:`Bearer \$\{token\}`/);
 assert.match(sender,/graphVersion,endpoint:details\.endpoint/);
 assert.match(sender,/response:details\.safeResponse/);
 assert.doesNotMatch(sender,/console\.(?:info|warn|error)\([^;]*\{[^}]*,\s*token(?:[,}])/i);
});

test("other Meta events only use server dedup when both sources exist",async()=>{
 const [rental,purchase,mechanical]=await Promise.all([
  read("components/PartyRentalBookingClient.tsx"),
  read("components/TenantMetaPixelPurchaseTracker.tsx"),
  read("components/MechanicalBullLanding.tsx"),
 ]);
 assert.match(purchase,/eventId:`purchase-\$\{bookingId\}`/);
 assert.match(rental,/trackMetaStandardEvent\("ViewContent"/);
 assert.match(mechanical,/trackMetaStandardEvent\("ViewContent"/);
 assert.doesNotMatch(`${rental}\n${purchase}\n${mechanical}`,/trackMetaBrowserAndServerEvent\([^\n]*"(?:Purchase|ViewContent)"/);
});
