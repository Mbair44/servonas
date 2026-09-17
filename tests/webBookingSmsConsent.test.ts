import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {webBookingSmsConsentDisclosure} from "../lib/smsConsent.ts";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("party-rental SMS consent is optional and unchecked by default",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 const input=source.match(/<input className="inline-checkbox" type="checkbox" name="smsConsent"[^>]*\/>/)?.[0]??"";
 assert.ok(input);
 assert.doesNotMatch(input,/defaultChecked|checked=|required/);
 assert.match(source,/Text me updates about my booking <small>Optional<\/small>/);
});

test("SMS disclosure includes carrier language, STOP, HELP, and public policy links",async()=>{
 const disclosure=webBookingSmsConsentDisclosure("Copper State Bounce");
 assert.match(disclosure,/Message frequency varies/);
 assert.match(disclosure,/Message and data rates may apply/);
 assert.match(disclosure,/Reply STOP to opt out or HELP for help/);
 assert.match(disclosure,/Consent is not a condition of purchase/);
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/>Privacy Policy<\/a>/);
 assert.match(source,/>Terms of Service<\/a>/);
});

test("checkout records both consent choices and affirmative consent in the existing ledger",async()=>{
 const [route,migration]=await Promise.all([read("app/api/checkout/route.ts"),read("supabase/migrations/20260914000900_web_booking_sms_consent.sql")]);
 assert.match(route,/body\.smsConsent===true\|\|body\.smsConsent==="true"/);
 assert.match(route,/record_web_booking_sms_consent/);
 assert.match(migration,/sms_consent=coalesce\(p_granted,false\)/);
 assert.match(migration,/if not coalesce\(p_granted,false\) then return;end if/);
 assert.match(migration,/insert into public\.customer_sms_consents/);
 assert.match(migration,/'web_booking'/);
});

test("custom-domain privacy and terms routes are public app routes",async()=>{
 const [privacy,terms,booking,legal,serviceForm]=await Promise.all([read("app/sites/domain/[domain]/privacy/page.tsx"),read("app/sites/domain/[domain]/terms/page.tsx"),read("app/sites/domain/[domain]/booking/page.tsx"),read("components/BookingLegalPage.tsx"),read("components/PublicBookingForm.tsx")]);
 assert.match(privacy,/BookingLegalPage kind="privacy"/);
 assert.match(terms,/BookingLegalPage kind="terms"/);
 assert.match(booking,/href="\/privacy"/);
 assert.match(booking,/href="\/terms"/);
 assert.match(booking,/policyBasePath=""/);
 assert.match(serviceForm,/`\$\{policyBase\}\/privacy`/);
 assert.match(serviceForm,/`\$\{policyBase\}\/terms`/);
 assert.match(legal,/We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes/);
 assert.match(legal,/Mobile information, text messaging originator opt-in data, and consent will not be shared with third parties or affiliates for marketing or promotional purposes/);
 assert.match(legal,/Message delivery is subject to your wireless carrier and is not guaranteed/);
});
