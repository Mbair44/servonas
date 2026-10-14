import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("rental Checkout returns only to a verified tenant origin and keeps hosted fallback URLs",async()=>{
 const [resolver,checkout]=await Promise.all([read("lib/tenantCheckoutOrigin.ts"),read("app/api/checkout/route.ts")]);
 assert.match(resolver,/Request Host is deliberately not an\s+\* input/);
 assert.match(resolver,/settings\?\.status==="published"&&settings\.domain_status==="connected"/);
 assert.match(resolver,/configuredHosts\.includes\(candidateHostname\)/);
 assert.match(resolver,/normalizedOrigin\(candidateOrigin\)/);
 assert.match(checkout,/candidateOrigin:request\.headers\.get\("origin"\)/);
 assert.match(checkout,/successUrl=`\$\{checkoutReturnOrigin\.origin\}\/success\?session_id=\{CHECKOUT_SESSION_ID\}`/);
 assert.match(checkout,/checkoutReturnOrigin\.usesTenantDomain/);
 assert.match(checkout,/\$\{checkoutReturnOrigin\.origin\}\/cancel/);
 assert.match(checkout,/`\$\{siteUrl\}\/book\/\$\{encodeURIComponent\(body\.businessSlug!\.trim\(\)\)\}`/);
});

test("custom-domain success verifies the booking tenant while preserving consent-gated conversion delivery",async()=>{
 const [success,domainSuccess,domainCancel,conversion,googleAds]=await Promise.all([
  read("components/StripeCheckoutSuccess.tsx"),read("app/sites/domain/[domain]/success/page.tsx"),read("app/sites/domain/[domain]/cancel/page.tsx"),read("components/GoogleAdsBookingConversion.tsx"),read("lib/googleAds.ts"),
 ]);
 assert.match(domainSuccess,/loadPublishedBusinessWebsiteByDomain\(domain,"\/sites\/domain\/\[domain\]\/success"\)/);
 assert.match(domainSuccess,/expectedBusinessId=\{record\.settings\.business_id\}/);
 assert.match(domainSuccess,/includeTenantGoogleTag=\{false\}/);
 assert.match(domainSuccess,/calendarHref="\/booking"/);
 assert.match(domainCancel,/loadPublishedBusinessWebsiteByDomain\(domain,"\/sites\/domain\/\[domain\]\/cancel"\)/);
 assert.match(success,/booking\?\.business_id!==expectedBusinessId\)notFound\(\)/);
 assert.match(success,/!session\.metadata\?\.payment_kind/);
 assert.match(success,/bookingConfirmed=booking\?\.status==="confirmed"/);
 assert.match(success,/totalCents=bookingTotalCents\?\?0/);
 assert.match(googleAds,/transaction_id:input\.bookingId/); // stable client-side dedupe key
 assert.match(conversion,/servonas:analytics-consent-updated/);
 assert.match(conversion,/payload\.confirmed===true/);
});
