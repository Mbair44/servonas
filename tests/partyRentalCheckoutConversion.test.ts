import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("rental checkout makes today's charge, remaining balance, and timing clear",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/Due today/);
 assert.match(source,/Remaining balance/);
 assert.match(source,/Automatically charged after your rental is completed/);
 assert.match(source,/Only \$\{money\(deposit\)\} is charged today/);
 assert.match(source,/Reserve for \$\{money\(deposit\)\}/);
 assert.match(source,/authorize the scheduled remaining-balance payment/);
});

test("auto-applied landing offer hides the promo entry and address selection preserves manual edits",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/appliedPromo\?\.automatic\?<div className="promo-code-box promo-code-box-applied"/);
 assert.match(source,/cityEditedRef\.current\|\|!cityRef\.current\.value/);
 assert.match(source,/zipEditedRef\.current\|\|!zipRef\.current\.value/);
 assert.match(source,/delivery_address_completed/);
});

test("checkout funnel events are idempotent through the existing event ledger",async()=>{
 const [events,route,migration,webhook]=await Promise.all([
  read("lib/bookingFunnel.ts"),read("app/api/public-booking/[businessSlug]/funnel/route.ts"),read("supabase/migrations/20260921000600_expand_checkout_funnel_events.sql"),read("app/api/stripe/webhook/route.ts"),
 ]);
 for(const name of ["checkout_addons_viewed","checkout_addons_skipped","checkout_addons_added","reservation_details_viewed","customer_info_completed","delivery_address_completed","terms_accepted","payment_cta_clicked","payment_started","payment_succeeded","booking_confirmed"])assert.match(events,new RegExp(`"${name}"`));
 assert.match(route,/case "payment_started"/);
 assert.match(migration,/payment_succeeded/);
 assert.match(webhook,/eventKey:`\$\{bookingId\}:payment_succeeded`/);
});
