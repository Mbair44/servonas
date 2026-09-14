import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
test("PostgreSQL: signed-tenant mapping, replay, START/STOP/HELP and request claims",{skip:!process.env.PGLITE_RUNTIME},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_RUNTIME!).href),db=new PGlite();
 try{
  await db.exec(await readFile(new URL("./fixtures/twilioPilotSchema.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20260914000800_tenant_sms_pilot.sql",import.meta.url),"utf8"));
  const business="20000000-0000-0000-0000-000000000001";
  const inbound=async(sid:string,body:string,opt:string="",tenant=business,account="ACtenantA",to="+14805550111")=>(await db.query("select process_inbound_sms($1,$2,$3,$4,$5::uuid,$6,$7) as result",[sid,"+14805550999",to,body,tenant,account,opt])).rows[0].result;
  const first=await inbound("SMfirst","TEST RECEIVED");assert.equal(first.business_id,business);assert.equal(first.reply,false);
  const repeat=await inbound("SMfirst","TEST RECEIVED");assert.equal(repeat.duplicate,true);assert.equal(repeat.message_id,first.message_id);
  assert.equal((await db.query("select count(*)::int as n from inbound_sms_messages")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int as n from customers")).rows[0].n,1);
  await assert.rejects(()=>inbound("SMwrong","hello","",business,"ACtenantB"),/mapping does not match/);
  await assert.rejects(()=>inbound("SMfirst","hello","","20000000-0000-0000-0000-000000000002","ACtenantB","+16025550222"),/Message tenant mismatch/);
  await inbound("SMstop","custom provider STOP keyword","STOP");
  assert.equal((await db.query("select status from customer_sms_consents")).rows[0].status,"opted_out");
  assert.equal((await db.query("select sms_consent_status from customers")).rows[0].sms_consent_status,"opted_out");
  const help=await inbound("SMhelp","HELP","HELP");assert.equal(help.reply,false);
  assert.equal((await db.query("select status from customer_sms_consents")).rows[0].status,"opted_out");
  await inbound("SMstart","START","START");
  assert.equal((await db.query("select status from customer_sms_consents")).rows[0].status,"express");
  assert.equal((await db.query("select sms_opted_out_at from customers")).rows[0].sms_opted_out_at,null);
  await inbound("SMstop","custom provider STOP keyword","STOP"); // stale retry cannot undo START
  assert.equal((await db.query("select status from customer_sms_consents")).rows[0].status,"express");
  await inbound("SMnormal","cancel my reservation please");assert.equal((await db.query("select status from customer_sms_consents")).rows[0].status,"express");
  await db.exec("insert into twilio_tenant_activation_events(business_id,request_key) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')");
  await assert.rejects(()=>db.exec("insert into twilio_tenant_activation_events(business_id,request_key) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')"),/unique/);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(()=>inbound("SMunauthorized","hello"),/Service role required/);
 }finally{await db.close();}
});
