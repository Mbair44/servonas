import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("inbound webhooks enqueue durable per-device intents without calling Expo",async()=>{
 const [route,migration]=await Promise.all([readFile(new URL("../app/api/twilio/inbound/route.ts",import.meta.url),"utf8"),readFile(new URL("../supabase/migrations/20261119000400_mobile_push_notification_foundation.sql",import.meta.url),"utf8")]);
 assert.match(route,/enqueue_inbound_message_push_intents/);
 assert.match(route,/if\(!timelineMessageId\)/);
 assert.doesNotMatch(route,/exp\.host|expo\.dev\/push/);
 assert.match(migration,/unique\(business_id,message_id,device_registration_id\)/);
 assert.match(migration,/m\.direction='inbound'/);
 assert.match(migration,/on conflict\(business_id,message_id,device_registration_id\) do nothing/);
 assert.match(migration,/bm\.role in \('owner','admin','manager'\)/);
});
