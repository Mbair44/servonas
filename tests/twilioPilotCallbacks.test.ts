import assert from "node:assert/strict";
import test from "node:test";
import {recordTenantStatusCallback} from "../lib/twilio/messageUsage.ts";
import {sendPilotSms} from "../lib/twilio/testSms.ts";
const business="20000000-0000-4000-8000-000000000001",account="AC"+"1".repeat(32),sid="SM"+"2".repeat(32);
async function mocked(run:()=>Promise<void>,handler:(url:URL,init:RequestInit)=>Response){
 const originalFetch=globalThis.fetch,keys=["NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","TWILIO_SMS_TEST_BUSINESS_ID","TWILIO_SMS_TEST_LIVE_ENABLED","SMS_DELIVERY_MODE","VERCEL_ENV"],original=keys.map(k=>process.env[k]);
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:"https://sms-test.invalid",SUPABASE_SERVICE_ROLE_KEY:"fixture",TWILIO_SMS_TEST_BUSINESS_ID:business,TWILIO_SMS_TEST_LIVE_ENABLED:"true",SMS_DELIVERY_MODE:"live",VERCEL_ENV:"production"});
 globalThis.fetch=async(input,init={})=>handler(new URL(String(input)),init);
 try{await run();}finally{globalThis.fetch=originalFetch;keys.forEach((k,i)=>{if(original[i]===undefined)delete process.env[k];else process.env[k]=original[i];});}
}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
test("delivery callback replay preserves one ledger entry and cannot downgrade delivery",async()=>{
 let row:Record<string,unknown>|null=null,inserts=0;
 await mocked(async()=>{
  await recordTenantStatusCallback({businessId:business,accountSid:account,messageSid:sid,status:"delivered"});
  await recordTenantStatusCallback({businessId:business,accountSid:account,messageSid:sid,status:"delivered"});
  await recordTenantStatusCallback({businessId:business,accountSid:account,messageSid:sid,status:"queued"});
  assert.equal(inserts,1);assert.equal(row!.message_status,"delivered");assert.ok(row!.last_status_callback_at);
 },(url,init)=>{
  assert.equal(url.hostname,"sms-test.invalid","a callback must never send an SMS");
  if(url.pathname.endsWith("/business_twilio_accounts"))return json({id:"account-record",business_id:business,twilio_subaccount_sid:account});
  if(url.pathname.endsWith("/twilio_message_usage")){
   if(init.method==="POST"){inserts++;row={...JSON.parse(String(init.body)),id:"usage-row"};return json({id:"usage-row"},201);}
   if(init.method==="PATCH"){row={...row,...JSON.parse(String(init.body))};return json({id:"usage-row"});}
   return json(row);
  }
  throw new Error(`Unexpected request ${url.pathname}`);
 });
});
test("callback storage errors propagate so the route can request a Twilio retry",async()=>{
 await mocked(async()=>{await assert.rejects(()=>recordTenantStatusCallback({businessId:business,accountSid:account,messageSid:sid,status:"delivered"}),/could not be recorded/);},(url,init)=>{
  if(url.pathname.endsWith("/business_twilio_accounts"))return json({id:"account-record"});
  return init.method==="POST"?json({code:"XX000",message:"storage unavailable"},500):json(null);
 });
});
test("replayed test-send requests return their durable claim without contacting Twilio",async()=>{
 await mocked(async()=>{
  const result=await sendPilotSms({requestKey:"30000000-0000-4000-8000-000000000001",to:"+14805550999",consent:true},"admin");
  assert.equal(result.to_status,"sending");
 },(url,init)=>{
  assert.equal(url.hostname,"sms-test.invalid");assert.ok(!init.method||init.method==="GET");
  return url.pathname.endsWith("/businesses")?json({id:business,name:"Copper State Bounce",slug:"copper-state-bounce"}):json({id:42,to_status:"sending",metadata:{}});
 });
});

test("only Copper State Bounce can use the pilot",async()=>{
 await mocked(async()=>{
  await assert.rejects(()=>sendPilotSms({requestKey:"30000000-0000-4000-8000-000000000001",to:"+14805550999",consent:true},"admin"),/restricted to Copper State Bounce/);
 },()=>json({id:business,name:"Another tenant",slug:"another"}));
});
