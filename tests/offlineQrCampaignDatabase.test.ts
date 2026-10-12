import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const runtime=process.env.PGLITE_RUNTIME;
test("offline campaign cohort counts, booked revenue, one-time cost, replay dedupe and tenant isolation",{skip:!runtime},async()=>{
 const {PGlite}=await import(runtime!);const db=new PGlite();
 const csb="cb25acc0-3623-4c06-9041-89a88f4ad6ed",other="00000000-0000-4000-8000-000000000002";
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.role() returns text language sql stable as $$ select current_user::text $$;grant usage on schema auth to authenticated,anon,service_role;
   create table businesses(id uuid primary key);
   insert into businesses values('${csb}'),('${other}');
   create function is_business_member(id uuid) returns boolean language sql stable as $$ select id=nullif(current_setting('test.business',true),'')::uuid $$;
   create table booking_attribution_sessions(id uuid primary key,business_id uuid,utm_source text,utm_medium text,utm_campaign text,session_started_at timestamptz,automated_classification text,first_landing_path text,entry_page_type text);
   create table booking_funnel_events(business_id uuid,attribution_session_id uuid,event_name text);
   create table bookings(id uuid primary key,business_id uuid,status text,total_cents bigint,amount_paid_cents bigint);
   create table booking_attribution_snapshots(booking_id uuid primary key,business_id uuid,attribution_session_id uuid);
   grant select on all tables in schema public to authenticated,service_role;
   set test.business='${csb}';`);
  await db.exec(await readFile(new URL("../supabase/migrations/20261013000100_offline_qr_campaign_reporting.sql",import.meta.url),"utf8"));
  const session=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  for(let n=1;n<=5;n++)await db.query("insert into booking_attribution_sessions values($1,$2,'offline','qr','sandwich_sign',$3,$4,'/booking?utm_source=offline','booking')",[session(n),n===5?other:csb,n===4?"2026-09-01":"2026-10-12",n===3?"automated_likely":"unknown"]);
  // Reloads and duplicated client/server checkout events remain one session.
  for(let n=0;n<3;n++)await db.query("insert into booking_funnel_events values($1,$2,'checkout_started')",[csb,session(1)]);
  const book=async(n:number,s:number,status:string,business=csb)=>{
   await db.query("insert into bookings values($1,$2,$3,25000,5000)",[session(100+n),business,status]);
   await db.query("insert into booking_attribution_snapshots values($1,$2,$3)",[session(100+n),business,session(s)]);
  };
  await book(1,1,"pending");await book(2,2,"canceled");await book(3,3,"confirmed");await book(4,4,"confirmed");await book(5,5,"confirmed",other);
  const report=async(business=csb)=> (await db.query("select * from offline_qr_campaign_report($1,'2026-10-01','2026-11-01')",[business])).rows;
  await db.exec("set role authenticated");
  let rows:any[]=await report();assert.equal(rows.length,1);assert.equal(Number(rows[0].visits),2);assert.equal(Number(rows[0].booking_page_visits),2);assert.equal(Number(rows[0].checkout_starts),1);assert.equal(Number(rows[0].completed_bookings),0);assert.equal(Number(rows[0].cost_cents),5000);
  assert.deepEqual(await report(other),[]);
  assert.equal((await db.query("select * from business_offline_campaign_costs where business_id=$1",[other])).rows.length,0);
  await assert.rejects(()=>db.exec("update business_offline_campaign_costs set cost_cents=0"));
  await db.exec("reset role");
  // Stripe confirmation changes the authoritative booking status; webhook replays
  // and the customer's return-page reload do not create additional bookings.
  for(let n=0;n<2;n++)await db.query("update bookings set status='confirmed' where id=$1",[session(101)]);
  await db.exec("set role authenticated");rows=await report();
  assert.equal(Number(rows[0].completed_bookings),1);assert.equal(Number(rows[0].converted_sessions),1);assert.equal(Number(rows[0].booked_revenue_cents),25000);
  assert.equal(Number(rows[0].booked_revenue_cents)/Number(rows[0].cost_cents),5); // $250 booked, not $50 deposit.
  assert.equal(Number(rows[0].converted_sessions)/Number(rows[0].visits),0.5);
  await db.exec(`set test.business='${other}'`);
  assert.deepEqual(await report(),[]);rows=await report(other);assert.equal(Number(rows[0].visits),1);assert.equal(rows[0].cost_cents,null);
  await db.exec("set role service_role");rows=await report();assert.equal(Number(rows[0].cost_cents),5000);
  await db.exec("set role anon");await assert.rejects(()=>report());
 }finally{await db.close();}
});
