import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";

const read=(path:string)=>readFile(fileURLToPath(new URL(`../${path}`,import.meta.url)),"utf8");
const csb="AW-18406171248/dJbiCJve5ZodEPDE38hE";

test("paid Stripe booking success uses the immutable full booking total and never the deposit",async()=>{
 const [success,component,checkout,webhook,managePayment]=await Promise.all([
  read("app/success/page.tsx"),read("components/TenantGoogleAdsBookingConversion.tsx"),read("app/api/checkout/route.ts"),read("app/api/stripe/webhook/route.ts"),read("app/api/manage-booking/[token]/pay/route.ts"),
 ]);
 assert.match(success,/select\("id,business_id,total_cents,businesses\(name\)"\)/);
 assert.match(success,/bookingTotalCents=Number\.isSafeInteger\(Number\(booking\?\.total_cents\)\)/);
 assert.match(success,/<TenantGoogleAdsBookingConversion bookingId=\{bookingId\} destination=\{googleAdsBookingConversionDestination\} totalCents=\{bookingTotalCents\} currency="USD"/);
 assert.match(success,/const paid = session\?\.payment_status === "paid"/);
 assert.doesNotMatch(success,/TenantGoogleAdsBookingConversion[\s\S]*depositCents/);
 assert.match(component,/value:totalCents\/100/);
 assert.match(component,/Number\.isSafeInteger\(totalCents\)/);
 // Checkout calculates and stores total before sending the deposit-only Stripe line item.
 assert.match(checkout,/total_cents:String\(totalCents\)/);
 assert.match(checkout,/unit_amount: depositCents/);
 assert.match(webhook,/finalTotalCents=Number\(session\.metadata\?\.total_cents\|\|0\)/);
 assert.match(webhook,/balance_due_cents:Math\.max\(0,finalTotalCents-amountPaidCents\)/);
 // Customer balance and payment-request Checkouts return to manage-booking, never /success.
 assert.match(managePayment,/success_url:`\$\{process\.env\.NEXT_PUBLIC_SITE_URL.*\/manage-booking\/\$\{token\}\?payment=processing`/);
 assert.doesNotMatch(managePayment,/\/success\?session_id/);
});

test("tenant destination, settings validation, success rendering, Meta boundary, and click IDs stay isolated",async()=>{
 const [migration,action,page,success,tracker,meta]=await Promise.all([
  read("supabase/migrations/20261013000200_google_ads_booking_conversion.sql"),read("app/app/[businessSlug]/settings/website/actions.ts"),read("app/app/[businessSlug]/settings/website/page.tsx"),read("app/success/page.tsx"),read("components/TenantBookingFunnelTracker.tsx"),read("components/TenantMetaPixelPurchaseTracker.tsx"),
 ]);
 assert.match(migration,/google_ads_booking_conversion_destination/);
 assert.match(migration,/AW-18406171248\/dJbiCJve5ZodEPDE38hE/);
 assert.match(migration,/split_part\(google_ads_booking_conversion_destination,'\/',1\)=google_ads_tag_id/);
 assert.match(migration,/where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed'/);
 assert.match(action,/normalizeGoogleAdsConversionDestination\(rawGoogleAdsBookingConversionDestination,googleAdsTagId\)/);
 assert.match(action,/google_ads_booking_conversion_destination:googleAdsBookingConversionDestination/);
 assert.match(page,/Google Ads Booking Conversion Destination/);
 assert.match(success,/normalizeGoogleAdsConversionDestination\(website\?\.google_ads_booking_conversion_destination,googleAdsTagId\)/);
 assert.match(success,/TenantMetaPixelPurchaseTracker/);
 assert.match(meta,/eventId:`purchase-\$\{bookingId\}`/);
 for(const clickId of ["gclid","gbraid","wbraid"]){assert.match(tracker,new RegExp(clickId));}
 assert.match(tracker,/applyStoredAttribution/);
});

test("migration rejects malformed or cross-tag destinations and seeds only CSB",{skip:!process.env.PGLITE_RUNTIME},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_RUNTIME!).href),db=new PGlite();
 try{
  await db.exec("create table business_website_settings(business_id uuid primary key,google_ads_tag_id text); insert into business_website_settings values ('cb25acc0-3623-4c06-9041-89a88f4ad6ed','AW-18406171248'),('11111111-1111-1111-1111-111111111111','AW-12345678901');");
  await db.exec(await read("supabase/migrations/20261013000200_google_ads_booking_conversion.sql"));
  const {rows}=await db.query("select business_id,google_ads_booking_conversion_destination from business_website_settings order by business_id");
  assert.equal(rows[0].google_ads_booking_conversion_destination,null);assert.equal(rows[1].google_ads_booking_conversion_destination,csb);
  await assert.rejects(db.query("update business_website_settings set google_ads_booking_conversion_destination='AW-bad/nope' where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed'"));
  await assert.rejects(db.query("update business_website_settings set google_ads_booking_conversion_destination='AW-18406171248/dJbiCJve5ZodEPDE38hE' where business_id='11111111-1111-1111-1111-111111111111'"));
 }finally{await db.close();}
});
