import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(path,import.meta.url),"utf8");

test("Phase 3 migration stores state and SIDs but no plaintext credential",async()=>{const sql=await read("../supabase/migrations/20260811000100_twilio_phase_3_activation.sql");assert.match(sql,/twilio_tenant_activations/);assert.match(sql,/outbound_sender_mode/);assert.doesNotMatch(sql,/(auth_token|api_key_secret|plaintext_secret)/i);assert.match(sql,/revoke insert,update,delete/);});

test("activation is explicit, charge acknowledged, and never purchases a number",async()=>{const route=await read("../app/api/admin/twilio/activation/[businessId]/route.ts"),service=await read("../lib/twilio/phase3Activation.ts");assert.match(route,/confirmation!=="ACTIVATE"/);assert.match(route,/acknowledgeCharges!==true/);assert.doesNotMatch(service,/IncomingPhoneNumbers\.json/);assert.match(service,/Primary Customer Profile must be Twilio Approved/);});

test("tenant sender cuts over only for active Messaging Service activation",async()=>{const sender=await read("../lib/twilio/tenantOutboundSender.ts"),delivery=await read("../lib/communications/customerCampaignDelivery.ts");assert.match(sender,/data\?\.status!=="active"/);assert.match(sender,/outbound_sender_mode!=="messaging_service"/);assert.match(delivery,/MessagingServiceSid/);assert.match(delivery,/tenant-message-status/);});

test("tenant callback verifies with the Vault token and scopes recipient by business",async()=>{const callback=await read("../app/api/twilio/tenant-message-status/route.ts");assert.match(callback,/getSubaccountAuthToken/);assert.match(callback,/validTwilioSignature/);assert.match(callback,/\.eq\("business_id",account\.business_id\)/);assert.doesNotMatch(callback,/console\.(log|error)/);});
