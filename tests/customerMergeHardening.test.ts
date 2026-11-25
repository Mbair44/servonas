import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

test("final merge migration validates address and channel selections inside preview and confirmation",()=>{
 const sql=read("../supabase/migrations/20261124000400_customer_merge_final_hardening.sql");
 assert.match(sql,/customer_merge_validate_resolutions/);
 assert.match(sql,/CUSTOMER_MERGE_INVALID_ADDRESS_SELECTION/);
 assert.match(sql,/company_name=coalesce/);
 assert.match(sql,/primaryAddressId/);
 assert.match(sql,/previewFingerprint/);
 assert.match(sql,/for update/);
});

test("outbound shared gateway and campaigns recheck exact channel consent",()=>{
 const consent=read("../lib/communications/exactChannelConsent.ts"),gateway=read("../lib/twilio/messageUsage.ts"),campaign=read("../lib/communications/customerCampaignDelivery.ts"),unsubscribe=read("../app/unsubscribe/[token]/actions.ts");
 assert.match(consent,/customer_contact_channels/);
 assert.match(consent,/status==="express"/);
 assert.match(consent,/status!=="opted_out"/);
 assert.match(gateway,/canSendExactChannel/);
 assert.match(campaign,/canSendExactChannel/);
 assert.match(unsubscribe,/consent_status:"unsubscribed"/);
});

test("customer profile displays durable merge activity",()=>{
 const profile=read("../app/app/[businessSlug]/customers/[customerId]/page.tsx"),activity=read("../components/CustomerMergeActivity.tsx");
 assert.match(profile,/CustomerMergeActivity/);
 assert.match(activity,/customer_merged/);
 assert.match(activity,/Merge history/);
});
