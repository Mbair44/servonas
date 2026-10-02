import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root=process.env.PGLITE_TEST_ROOT;
test("booking attribution session upsert is atomic and preserves first-touch attribution",{skip:!root},async()=>{
 const {PGlite}=await import(`${root}/dist/index.js`);const db=new PGlite();
 const business="00000000-0000-4000-8000-000000000001",session="00000000-0000-4000-8000-000000000002";
 try{
  await db.exec(`create role service_role;create table booking_attribution_sessions(id uuid primary key,business_id uuid not null,first_landing_url text,first_landing_path text,first_referrer text,gclid text,gbraid text,wbraid text,fbclid text,utm_source text,utm_medium text,utm_campaign text,utm_content text,utm_term text,utm_id text,created_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),updated_at timestamptz not null default now(),session_started_at timestamptz not null default now(),session_ended_at timestamptz,entry_path text,last_path text,entry_page_type text,last_page_type text,page_count integer not null default 0,engaged_page_count integer not null default 0,total_session_duration_seconds integer not null default 0,engaged_duration_seconds integer not null default 0,total_session_duration_milliseconds bigint,engaged_duration_milliseconds bigint,duration_source text,duration_final_flush_received boolean not null default false,duration_last_flush_reason text,browser text,operating_system text,device_type text,first_interaction_type text,first_interaction_label text,first_interaction_identifier text,first_interaction_path text,first_interaction_at timestamptz,time_to_first_interaction_milliseconds bigint,meaningful_interaction_count integer not null default 0,automated_classification text not null default 'unknown',automated_classification_reason text);`);
  await db.exec(await readFile(new URL("../supabase/migrations/20261002000100_atomic_booking_attribution_session_upsert.sql",import.meta.url),"utf8"));
  const touch=(patch:object,id=session)=>db.query("select public.upsert_booking_attribution_session($1,$2,$3::jsonb)",[business,id,JSON.stringify(patch)]);
  await touch({first_landing_path:"/summer",utm_source:"facebook",page_increment:1,duration_increment_milliseconds:1000,automated_classification:"unknown"});
  const first=(await db.query("select * from booking_attribution_sessions where id=$1",[session])).rows[0] as any;
  assert.equal(first.utm_source,"facebook");assert.equal(first.page_count,1);assert.equal(first.total_session_duration_milliseconds,1000);
  await touch({first_landing_path:null,utm_source:null,last_path:"/booking",duration_increment_milliseconds:500,automated_classification:"unknown"});
  const updated=(await db.query("select * from booking_attribution_sessions where id=$1",[session])).rows[0] as any;
  assert.equal(updated.utm_source,"facebook");assert.equal(updated.first_landing_path,"/summer");assert.equal(updated.last_path,"/booking");assert.equal(updated.total_session_duration_milliseconds,1500);assert.ok(new Date(updated.updated_at).getTime()>=new Date(first.updated_at).getTime());assert.equal(new Date(updated.created_at).getTime(),new Date(first.created_at).getTime());
  const concurrent="00000000-0000-4000-8000-000000000003";
  await Promise.all([touch({utm_source:"google",duration_increment_milliseconds:100},concurrent),touch({utm_source:null,duration_increment_milliseconds:200},concurrent)]);
  const raced=(await db.query("select * from booking_attribution_sessions where id=$1",[concurrent])).rows[0] as any;
  assert.equal(raced.utm_source,"google");assert.equal(raced.total_session_duration_milliseconds,300);
 }finally{await db.close();}
});
