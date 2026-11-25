import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {exactChannelConsent} from "../lib/communications/exactChannelConsent.ts";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const delivery=read("../lib/communications/customerCampaignDelivery.ts");
const action=read("../app/app/[businessSlug]/customers/campaigns/actions.ts");
const gateway=read("../lib/twilio/messageUsage.ts");
const migration=read("../supabase/migrations/20261125000100_campaign_delivery_safety.sql");

test("campaign SMS uses the tenant gateway and exact marketing consent",()=>{
 assert.match(delivery,/canSendExactChannel/);
 assert.match(delivery,/purpose:"marketing"/);
 assert.match(delivery,/sendTenantTwilioMessage/);
 assert.doesNotMatch(delivery,/getTwilioCredentials|Messages\.json/);
 assert.match(gateway,/input\.purpose/);
});

test("consent and provider failures become per-recipient results",()=>{
 assert.match(delivery,/ExactChannelConsentError/);
 assert.match(delivery,/Campaign consent records are not ready\. No message was sent/);
 assert.match(delivery,/status:"failed"/);
 assert.match(delivery,/status:"skipped"/);
 assert.match(delivery,/Campaign recipient delivery failed/);
});

test("campaign recipient must be claimed before provider delivery",()=>{
 assert.match(delivery,/status:"sending"/);
 assert.match(delivery,/\.eq\("status","queued"\)/);
 assert.match(delivery,/\.is\("provider_message_id",null\)/);
 assert.match(migration,/send_claimed_at/);
 assert.match(migration,/send_attempt_token/);
 assert.match(migration,/sending/);
 assert.match(action,/provider_message_id\)continue/);
});

test("retries stay tenant scoped and cannot retry an accepted recipient",()=>{
 assert.match(action,/\.eq\("business_id",business\.id\)/);
 assert.match(action,/\.is\("provider_message_id",null\)/);
 assert.match(action,/Campaign recipients could not be loaded\. No messages were sent/);
});

test("campaign SMS preserves the authored URL and does not duplicate STOP language",()=>{
 assert.match(delivery,/const smsBody=`\$\{body\}\$\{stopNotice\}`/);
 assert.match(delivery,/reply\\s\+stop\\s\+to\\s\+opt\\s\+out/);
 assert.doesNotMatch(delivery,/body\.replace\(firstUrl/);
});

test("duplicate merged channel records fail closed without a single-row query error",async()=>{
 const rows=[{consent_status:"express"},{consent_status:"express"}];
 const query:any={eq:()=>query,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(resolve)};
 const db={from:()=>({select:()=>query})};
 assert.equal(await exactChannelConsent(db,{businessId:"tenant",channel:"phone",value:"+14805550123"}),"express");
 rows[1].consent_status="opted_out";
 assert.equal(await exactChannelConsent(db,{businessId:"tenant",channel:"phone",value:"+14805550123"}),"opted_out");
});
