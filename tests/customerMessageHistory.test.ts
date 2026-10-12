import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {verifiedHistoricalBody,type HistoricalMessage,type HistoryRow} from "../lib/customerMessages/history.ts";
const row:HistoryRow={id:"id",business_id:"a",provider_message_id:`SM${"1".repeat(32)}`,counterparty_phone_e164:"+16025550123",body:"pending"};
const original:HistoricalMessage={sid:row.provider_message_id,account_sid:"ACtenant",direction:"outbound-api",to:row.counterparty_phone_e164,body:"The original reminder",status:"delivered"};
test("historical body recovery verifies SID, tenant account, recipient and direction",()=>{
 assert.equal(verifiedHistoricalBody(original,row,"ACtenant"),original.body);
 for(const change of [{sid:"SMother"},{account_sid:"ACother"},{to:"+16025550999"},{direction:"inbound"},{body:""},{body:"x".repeat(1601)}])assert.equal(verifiedHistoricalBody({...original,...change},row,"ACtenant"),null);
});
test("history retrieval is read-only at Twilio and tenant-scoped before lookup",async()=>{
 const source=await readFile(new URL("../lib/customerMessages/historyProvider.ts",import.meta.url),"utf8");
 assert.match(source,/method:"GET"/);assert.doesNotMatch(source,/method:"POST"|sendTenantTwilioMessage/);
 assert.match(source,/eq\("business_id",businessId\).eq\("twilio_message_sid",row.provider_message_id\)/);
 assert.match(source,/eq\("business_id",businessId\).eq\("twilio_subaccount_sid",accountSid\)/);
});
test("PostgreSQL history backfill, repeatability, future sends, tenant links and private helpers",{skip:!process.env.PGLITE_RUNTIME},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_RUNTIME!).href),db=new PGlite();
 const a="10000000-0000-4000-8000-000000000001",b="10000000-0000-4000-8000-000000000002",ca="20000000-0000-4000-8000-000000000001",cb="20000000-0000-4000-8000-000000000002",job="30000000-0000-4000-8000-000000000001",booking="40000000-0000-4000-8000-000000000001";
 const sid=(n:number)=>`SM${String(n).padStart(32,"0")}`;
 try{
  await db.exec(`create role anon; create role authenticated;
   create table businesses(id uuid primary key);
   create table customers(id uuid primary key,business_id uuid,phone text,phone_normalized text);
   create table jobs(id uuid primary key,business_id uuid,customer_id uuid);
   create table bookings(id uuid primary key,business_id uuid,customer_id uuid);
   create table job_communication_events(id uuid primary key default gen_random_uuid(),job_id uuid,channel text,template_key text,status text,recipient_phone text,message_body text,provider_message_id text,sent_at timestamptz,created_at timestamptz default now());
   create table sms_messages(id uuid primary key default gen_random_uuid(),booking_id uuid,template_key text,status text,to_phone text,body text,twilio_message_sid text,sent_at timestamptz,created_at timestamptz default now());
   create table twilio_message_usage(business_id uuid,twilio_message_sid text,to_phone_e164 text);
   create table customer_messages(id uuid primary key default gen_random_uuid(),business_id uuid,customer_id uuid,counterparty_phone_e164 text,direction text,provider text,provider_message_id text,body text check(length(body) between 1 and 1600),status text,source_type text,read_at timestamptz,sent_at timestamptz,created_at timestamptz,unique(provider,provider_message_id));
   create function normalize_phone_e164(p_value text) returns text language sql immutable strict as $$ select case when p_value ~ '^\\+[1-9][0-9]{7,14}$' then p_value else null end $$;
  `);
  await db.query("insert into businesses values ($1),($2)",[a,b]);
  await db.query("insert into customers values ($1,$2,'+16025550123','+16025550123'),($3,$4,'+16025550999','+16025550999')",[ca,a,cb,b]);
  await db.query("insert into jobs values ($1,$2,$3)",[job,a,ca]);await db.query("insert into bookings values ($1,$2,$3)",[booking,a,ca]);
  async function event(n:number,status="sent",template="reminder",body:string|null="Exact old reminder"){
   await db.query("insert into job_communication_events(job_id,channel,template_key,status,recipient_phone,message_body,provider_message_id,sent_at) values ($1,'sms',$2,$3,'+16025550123',$4,$5,'2026-09-01T12:00:00Z')",[job,template,status,body,sid(n)]);
  }
  await event(1);await event(2,"sent","payment_receipt",null);await event(3,"stubbed");await event(4,"failed");await event(5,"queued");await event(6,"sent","manager_new_booking");
  await db.query("insert into sms_messages(booking_id,template_key,status,to_phone,body,twilio_message_sid,sent_at) values ($1,'confirmation','sent','+16025550123','Exact confirmation',$2,'2026-08-01T12:00:00Z')",[booking,sid(7)]);
  await db.query("insert into customer_messages(business_id,customer_id,counterparty_phone_e164,direction,provider,provider_message_id,body,status,source_type,read_at) values ($1,$2,'+16025550123','outbound','twilio',$3,'Canonical text','delivered','booking_confirmation','2026-10-01T12:00:00Z')",[a,ca,sid(1)]);
  const sql=await readFile(new URL("../supabase/migrations/20261012000300_booking_sms_history.sql",import.meta.url),"utf8");await db.exec(sql);
  let result=await db.query("select * from customer_messages order by provider_message_id");assert.equal(result.rows.length,3);
  assert.equal(result.rows[0].body,"Canonical text");assert.equal(result.rows[0].status,"delivered");assert.ok(result.rows[0].read_at);
  assert.equal(result.rows[1].history_body_pending,true);assert.match(result.rows[1].body,/Original message text was not saved/);
  assert.equal(result.rows[2].body,"Exact confirmation");assert.equal(result.rows[2].customer_id,ca);assert.equal(result.rows[2].business_id,a);assert.equal(new Date(result.rows[2].sent_at).toISOString(),"2026-08-01T12:00:00.000Z");
  await db.exec(sql);assert.equal((await db.query("select * from customer_messages")).rows.length,3);
  await event(8);assert.equal((await db.query("select * from customer_messages")).rows.length,4);
  await db.query("update job_communication_events set status='sent' where provider_message_id=$1",[sid(5)]);assert.equal((await db.query("select * from customer_messages")).rows.length,5);
  await db.query("select record_booking_sms_history($1,$2,'+16025550123','Foreign customer id', $3,'reminder',now())",[a,cb,sid(9)]);
  result=await db.query("select customer_id,business_id from customer_messages where provider_message_id=$1",[sid(9)]);assert.equal(result.rows[0].customer_id,null);assert.equal(result.rows[0].business_id,a);
  const permission=await db.query("select has_function_privilege('authenticated','record_booking_sms_history(uuid,uuid,text,text,text,text,timestamptz)','execute') as allowed");assert.equal(permission.rows[0].allowed,false);
 }finally{await db.close();}
});
