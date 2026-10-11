import assert from "node:assert/strict";
import test from "node:test";
import {inboundVoiceTwiml,missedInboundVoiceTwiml,normalizeVoicePhone,voiceAnswerType} from "../lib/twilio/voice.ts";
import {readFile} from "node:fs/promises";
import twilio from "twilio";
import {validTwilioSignature} from "../lib/twilioWebhook.ts";

test("voice routing screens every staff leg with AMD before it may bridge",()=>{
 const xml=inboundVoiceTwiml({callId:"CA123",businessId:"business",targets:[{employeeId:"staff-1",phone:"+14805550123"},{employeeId:"staff-2",phone:"+16025550123"}],timeout:20,record:false,origin:"https://servonas.com"});
 assert.match(xml,/answerOnBridge="true" timeout="20"/);assert.match(xml,/machineDetection="Enable"/);assert.match(xml,/\/api\/twilio\/voice\/staff-answer/);assert.match(xml,/amdStatusCallback=/);assert.equal((xml.match(/<Number /g)??[]).length,2);assert.doesNotMatch(xml,/<(?:Say|Play|Gather|Pause)/);
});
test("unanswered Dial callbacks receive voicemail TwiML with recording",()=>{
 const xml=missedInboundVoiceTwiml({callId:"CA123",businessId:"business",origin:"https://servonas.com"});
 assert.match(xml,/<Say>Sorry we missed your call/);assert.match(xml,/<Record /);assert.match(xml,/recording=1/);assert.match(xml,/parent=CA123/);
});
test("voice phone normalization is explicit",()=>{assert.equal(normalizeVoicePhone("(480) 555-0123"),"+14805550123");assert.equal(normalizeVoicePhone("bad"),null);});
test("only a confirmed human AMD result can accept a staff leg",()=>{assert.equal(voiceAnswerType("human"),"human");assert.equal(voiceAnswerType("machine_start"),"machine");assert.equal(voiceAnswerType("fax"),"fax");assert.equal(voiceAnswerType(null),"unknown");});
test("official Twilio Voice signatures preserve repeated fields and encoded values",()=>{
 const url="https://servonas.com/api/twilio/voice/inbound",token="tenant-auth-token",params={AccountSid:"AC123",CallSid:"CA123",To:"+14804855057",From:"+14805550123",CallerName:"José + Test",Digits:["2","1"]},body=new URLSearchParams();
 for(const [key,value] of Object.entries(params))for(const item of Array.isArray(value)?value:[value])body.append(key,item);
 const signature=twilio.getExpectedTwilioSignature(token,url,params);assert.equal(validTwilioSignature(url,body,signature,token),true);assert.equal(validTwilioSignature(url,body,"invalid",token),false);assert.equal(validTwilioSignature(`${url}/`,body,signature,token),false);assert.equal(validTwilioSignature(url,body,signature,"other-tenant-token"),false);
});
test("voice webhooks validate signatures, require human acceptance, and claim missed SMS atomically",async()=>{
 const source=await Promise.all([readFile("app/api/twilio/voice/inbound/route.ts","utf8"),readFile("app/api/twilio/voice/status/route.ts","utf8"),readFile("app/api/twilio/voice/outbound/route.ts","utf8"),readFile("app/api/twilio/voice/staff-answer/route.ts","utf8"),readFile("supabase/migrations/20261010000300_voice_human_answer_guard.sql","utf8")]);
 assert.match(source[0],/validTwilioSignature/);assert.match(source[1],/is\("missed_call_sms_sent_at",null\)/);assert.match(source[1],/is\("missed_call_sms_claimed_at",null\)/);assert.match(source[1],/void sendMissedCallSms/);assert.match(source[1],/missedInboundVoiceTwiml/);assert.match(source[1],/call\.human_answered/);assert.match(source[2],/validTwilioSignature/);assert.match(source[3],/answerType!=="human"/);assert.match(source[3],/human_answered:true/);assert.match(source[4],/human_answered boolean/);assert.match(source[4],/answer_type/);
});
test("inbound 403 diagnostic distinguishes security resolution from signature validity",async()=>{
 const source=await readFile("app/api/twilio/voice/inbound/route.ts","utf8");
 for(const field of["voiceWebhookSecurityResolved","securityMode","businessId","accountSid","normalizedTo","configuredWebhookUrl","requestUrl","signaturePresent","signatureValid"])assert.match(source,new RegExp(field));
 assert.match(source,/signatureValid=Boolean\(security&&validTwilioSignature/);
 assert.doesNotMatch(source,/console\.info\([^\n]*security\.token/);
});
