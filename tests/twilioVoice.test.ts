import assert from "node:assert/strict";
import test from "node:test";
import {dialCompletionAction,inboundVoiceTwiml,missedInboundVoiceTwiml,normalizeVoicePhone,voiceAnswerType} from "../lib/twilio/voice.ts";
import {readFile} from "node:fs/promises";
import twilio from "twilio";
import {validTwilioSignature} from "../lib/twilioWebhook.ts";

test("voice routing sends every staff leg to private keypad screening before it may bridge",()=>{
 const xml=inboundVoiceTwiml({callId:"CA123",businessId:"business",targets:[{employeeId:"staff-1",phone:"+14805550123"},{employeeId:"staff-2",phone:"+16025550123"}],timeout:20,record:false,origin:"https://servonas.com"});
 assert.match(xml,/answerOnBridge="true" timeout="20"/);assert.match(xml,/action="https:\/\/servonas\.com\/api\/twilio\/voice\/dial-complete\?parent=CA123&amp;business=business" method="POST"/);assert.match(xml,/machineDetection="Enable"/);assert.match(xml,/\/api\/twilio\/voice\/staff-screen/);assert.match(xml,/\/api\/twilio\/voice\/leg-status/);assert.match(xml,/statusCallbackMethod="POST"/);assert.match(xml,/amdStatusCallback=/);assert.equal((xml.match(/<Number /g)??[]).length,2);assert.doesNotMatch(xml,/<(?:Say|Play|Gather|Pause)/);
});
test("unanswered Dial callbacks receive voicemail TwiML with recording",()=>{
 const xml=missedInboundVoiceTwiml({callId:"CA123",businessId:"business",origin:"https://servonas.com"});
 assert.match(xml,/<Say>Sorry we missed your call/);assert.match(xml,/<Record /);assert.match(xml,/\/api\/twilio\/voice\/voicemail-complete/);assert.match(xml,/parent=CA123/);
});
test("voice phone normalization is explicit",()=>{assert.equal(normalizeVoicePhone("(480) 555-0123"),"+14805550123");assert.equal(normalizeVoicePhone("bad"),null);});
test("AMD remains informational for staff answers",()=>{assert.equal(voiceAnswerType("human"),"human");assert.equal(voiceAnswerType("machine_start"),"machine");assert.equal(voiceAnswerType("fax"),"fax");assert.equal(voiceAnswerType(null),"unknown");});
test("only the Servonas human-accepted state can complete a Dial without voicemail",()=>{
 assert.equal(dialCompletionAction({humanAccepted:true,dialCallStatus:"completed"}),"complete");
 assert.equal(dialCompletionAction({humanAccepted:false,dialCallStatus:"completed"}),"voicemail");
 assert.equal(dialCompletionAction({humanAccepted:false,dialCallStatus:"no_answer"}),"voicemail");
 assert.equal(dialCompletionAction({humanAccepted:false,dialCallStatus:"busy"}),"voicemail");
 assert.equal(dialCompletionAction({humanAccepted:false,dialCallStatus:"failed"}),"voicemail");
 assert.equal(dialCompletionAction({humanAccepted:false,dialCallStatus:"canceled"}),"voicemail");
});
test("official Twilio Voice signatures preserve repeated fields and encoded values",()=>{
 const url="https://servonas.com/api/twilio/voice/inbound",token="tenant-auth-token",params={AccountSid:"AC123",CallSid:"CA123",To:"+14804855057",From:"+14805550123",CallerName:"José + Test",Digits:["2","1"]},body=new URLSearchParams();
 for(const [key,value] of Object.entries(params))for(const item of Array.isArray(value)?value:[value])body.append(key,item);
 const signature=twilio.getExpectedTwilioSignature(token,url,params);assert.equal(validTwilioSignature(url,body,signature,token),true);assert.equal(validTwilioSignature(url,body,"invalid",token),false);assert.equal(validTwilioSignature(`${url}/`,body,signature,token),false);assert.equal(validTwilioSignature(url,body,signature,"other-tenant-token"),false);
});
test("voice webhooks separate leg events, Dial continuation, and voicemail completion",async()=>{
 const source=await Promise.all([readFile("app/api/twilio/voice/inbound/route.ts","utf8"),readFile("app/api/twilio/voice/leg-status/route.ts","utf8"),readFile("app/api/twilio/voice/dial-complete/route.ts","utf8"),readFile("app/api/twilio/voice/voicemail-complete/route.ts","utf8"),readFile("app/api/twilio/voice/staff-screen/route.ts","utf8"),readFile("app/api/twilio/voice/staff-accept/route.ts","utf8"),readFile("supabase/migrations/20261010000300_voice_human_answer_guard.sql","utf8"),readFile("app/api/voice-recordings/[businessSlug]/[callId]/route.ts","utf8"),readFile("app/app/[businessSlug]/calls/page.tsx","utf8")]);
 assert.match(source[0],/dial-complete/);assert.match(source[1],/Twilio voice leg status/);assert.doesNotMatch(source[1],/missedInboundVoiceTwiml/);assert.match(source[2],/Twilio Dial completed/);assert.match(source[2],/dialCompletionAction/);assert.match(source[2],/humanAccepted/);assert.match(source[2],/answeredByEmployeeId/);assert.match(source[2],/missedInboundVoiceTwiml/);assert.match(source[2],/after\(\(\)=>sendMissedCallSms/);assert.match(source[2],/eq\("human_answered",false\)/);assert.doesNotMatch(source[2],/eq\("was_missed",false\)/);assert.match(source[2],/missed_call_sms_enabled===false/);for(const event of["Twilio missed-call SMS queued","Twilio missed-call SMS sending","Twilio missed-call SMS sent","Twilio missed-call SMS failed","messageSid"]){assert.match(source[2],new RegExp(event));}assert.match(source[2],/return xml\(twiml\)/);assert.match(source[3],/Twilio voicemail completed/);assert.match(source[4],/Twilio staff screening started/);assert.match(source[4],/<Gather input="dtmf" numDigits="1" timeout="5"/);assert.match(source[5],/Twilio staff screening accepted/);assert.match(source[5],/human_answered:true/);assert.match(source[5],/digit!=="1"/);assert.match(source[5],/eq\("human_answered",false\)/);assert.match(source[6],/human_answered boolean/);assert.match(source[6],/answer_type/);assert.match(source[7],/requireWorkspace\(businessSlug\)/);assert.match(source[7],/Recordings\/\$\{encodeURIComponent\(call\.recording_sid\)\}\.mp3/);assert.match(source[7],/Cache-Control":"private, no-store/);assert.match(source[8],/<audio controls/);assert.match(source[8],/api\/voice-recordings/);assert.match(source[8],/>Call Back</);assert.match(source[8],/>Text</);
});
test("tenant inbound SMS logs receipt after idempotent persistence",async()=>{
 const source=await Promise.all([readFile("app/api/twilio/inbound/route.ts","utf8"),readFile("app/app/[businessSlug]/customers/messages/page.tsx","utf8")]);
 assert.match(source[0],/process_inbound_sms/);assert.match(source[0],/Twilio inbound SMS received/);assert.match(source[0],/if\(!result\.duplicate\)/);assert.match(source[0],/validTwilioSignature/);assert.match(source[1],/Message inbox/);assert.match(source[1],/provider_message_id/);
});
test("Dial action trace captures the dedicated callback URL and voicemail TwiML",async()=>{
 const source=await Promise.all([readFile("app/api/twilio/voice/inbound/route.ts","utf8"),readFile("app/api/twilio/voice/dial-complete/route.ts","utf8")]);
 assert.match(source[0],/Twilio voice Dial action constructed/);assert.match(source[0],/actionUrl:/);assert.match(source[0],/method:"POST"/);
 for(const field of["dialCallSid","dialCallStatus","request.url","Twilio Dial completed","contentType","twiml"]){assert.match(source[1],new RegExp(field));}
});
test("inbound 403 diagnostic distinguishes security resolution from signature validity",async()=>{
 const source=await readFile("app/api/twilio/voice/inbound/route.ts","utf8");
 for(const field of["voiceWebhookSecurityResolved","securityMode","businessId","accountSid","normalizedTo","configuredWebhookUrl","requestUrl","signaturePresent","signatureValid"])assert.match(source,new RegExp(field));
 assert.match(source,/signatureValid=Boolean\(security&&validTwilioSignature/);
 assert.doesNotMatch(source,/console\.info\([^\n]*security\.token/);
});
