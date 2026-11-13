import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("paid Smart Upsells notify the business without making email delivery part of payment fulfillment",()=>{
 const webhook=read("app/api/stripe/webhook/route.ts"),staged=read("lib/bookingManage/stagedAmendments.ts"),checkout=read("lib/smartUpsellCheckout.ts"),email=read("lib/communications/smartUpsellEmailService.ts");
 assert.match(staged,/smartUpsell:smartOfferId\?\{offerId:smartOfferId/);
 assert.match(webhook,/sendSmartUpsellBusinessNotification/);
 assert.match(webhook,/if\(amendment\.applied&&amendment\.smartUpsell\)/);
 assert.match(webhook,/Smart Upsell business notification email was not delivered/);
 assert.match(checkout,/if\(!staged\.checkoutUrl\)\{const notification=await sendSmartUpsellBusinessNotification/);
 assert.match(email,/Idempotency-Key/);
 assert.match(email,/`smart-upsell\/\$\{input\.offerId\}`/);
 assert.match(email,/businesses\(name,email,owner_user_id\)/);
 assert.match(email,/Smart Upsell added to reservation/);
});
