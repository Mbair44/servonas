import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {sendExpoIncomingMessagePush} from "../lib/mobilePush/expoPush.ts";
const valid="ExponentPushToken[unit-test-token]",input={token:valid,businessId:"00000000-0000-0000-0000-000000000001",messageId:"00000000-0000-0000-0000-000000000002",title:"Acme"};
test("Expo adapter is mockable and classifies provider outcomes without live calls",async()=>{
 const ok=await sendExpoIncomingMessagePush(input,async()=>new Response(JSON.stringify({data:[{status:"ok"}]}),{status:200}));assert.equal(ok.kind,"accepted");
 const invalid=await sendExpoIncomingMessagePush(input,async()=>new Response(JSON.stringify({data:[{status:"error",details:{error:"DeviceNotRegistered"}}]}),{status:200}));assert.equal(invalid.kind,"invalid_token");
 const retry=await sendExpoIncomingMessagePush(input,async()=>new Response("",{status:503}));assert.equal(retry.kind,"temporary");
 const uncertain=await sendExpoIncomingMessagePush(input,async()=>{throw new Error("timeout");});assert.equal(uncertain.kind,"uncertain");
 assert.equal((await sendExpoIncomingMessagePush({...input,token:"bad"},async()=>{throw new Error("must not run");})).kind,"invalid_token");
});
test("worker is fail-closed, leased, reauthorized, and bounded",async()=>{
 const [route,migration]=await Promise.all([readFile(new URL("../app/api/cron/mobile-inbound-push/route.ts",import.meta.url),"utf8"),readFile(new URL("../supabase/migrations/20261119000400_mobile_push_notification_foundation.sql",import.meta.url),"utf8")]);
 assert.match(route,/isAuthorizedCronRequest/);assert.match(route,/claim_inbound_message_push_outbox/);assert.match(route,/reconcile_recent_inbound_message_push_intents/);assert.match(route,/maxRetries=5/);assert.match(route,/authorization_revoked/);assert.match(route,/invalid_token/);assert.match(route,/provider_outcome_uncertain/);
 assert.match(migration,/for update skip locked/);assert.match(migration,/lease_expires_at<now\(\)/);assert.match(migration,/interval '5 minutes'/);assert.match(migration,/created_at>=now\(\)-interval '10 minutes'/);
});
