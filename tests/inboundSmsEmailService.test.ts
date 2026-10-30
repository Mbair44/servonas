import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {inboundSmsEmailAlertContent} from "../lib/communications/inboundSmsEmailService.ts";

test("inbound SMS email alert renders the sender, message, and secure inbox link",()=>{
 const content=inboundSmsEmailAlertContent({businessId:"business-1",businessName:"Copper State Bounce",recipient:"owner@example.com",messageId:"message-1",customerId:"customer-1",customerName:"Jane <Smith>",fromPhone:"+14805551234",body:"Can I move my booking?",inboxUrl:"https://servonas.com/app/copper-state-bounce/messages?customerId=customer-1"});
 assert.equal(content.subject,"New text from Jane <Smith> — Copper State Bounce");
 assert.match(content.text,/Can I move my booking\?/);
 assert.match(content.text,/Open conversation: https:\/\/servonas\.com/);
 assert.match(content.html,/Jane &lt;Smith&gt;/);
 assert.match(content.html,/Open this conversation in Servonas/);
});

test("inbound SMS alert is only sent after non-duplicate, tenant-scoped intake",async()=>{
 const [route,service]=await Promise.all([readFile("app/api/twilio/inbound/route.ts","utf8"),readFile("lib/communications/inboundSmsEmailService.ts","utf8")]);
 assert.match(route,/if\(!result\.duplicate\)\{/);
 assert.match(route,/email_alerts_enabled/);
 assert.match(route,/sendInboundSmsEmailAlert/);
 assert.match(route,/eq\("business_id",result\.business_id\)/);
 assert.match(service,/Idempotency-Key/);
});
