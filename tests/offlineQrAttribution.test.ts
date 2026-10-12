import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {resolveBookingSession,ensureCheckoutAttributionSession,snapshotBookingAttribution} from "../lib/bookingFunnel.ts";
import {normalizeMarketingSource} from "../lib/marketingAttribution.ts";
const qr="https://copperstatebounce.com/booking?utm_source=offline&utm_medium=qr&utm_campaign=sandwich_sign";
const id="00000000-0000-4000-8000-000000000001",next="00000000-0000-4000-8000-000000000002";
const attrs={utm_source:"offline",utm_medium:"qr",utm_campaign:"sandwich_sign"};
test("direct printed QR visit captures UTMs; reload, item selection and checkout preserve one session",()=>{
 const first=resolveBookingSession(null,qr,"",()=>id);
 assert.deepEqual(first.attribution,attrs);
 assert.equal(normalizeMarketingSource(first.attribution),"offline");
 for(const url of [qr,"https://copperstatebounce.com/booking?date=2026-10-20","https://copperstatebounce.com/booking/checkout?sv_at="+id]){
  const continued=resolveBookingSession(first,url,"",()=>next);assert.equal(continued.sessionId,first.sessionId);assert.deepEqual(continued.attribution,first.attribution);
 }
 // A new storage context can continue a propagated session without losing campaign tags.
 const redirected=resolveBookingSession(null,qr+"&sv_at="+id,"",()=>next);
 assert.equal(redirected.sessionId,id);assert.deepEqual(redirected.attribution,attrs);
});
test("a QR arrival replaces an old campaign without mixing old click IDs or creating a session on every reload",()=>{
 const previous=resolveBookingSession(null,"https://copperstatebounce.com/?utm_source=google&gclid=old","",()=>id);
 const current=resolveBookingSession(previous,qr,"https://copperstatebounce.com/?gclid=old",()=>next);
 assert.equal(current.sessionId,next);assert.deepEqual(current.attribution,attrs);
 assert.equal(resolveBookingSession(current,qr,"",()=>id).sessionId,next);
 // Another tenant has separate storage and does not inherit this tenant's state.
 assert.deepEqual(resolveBookingSession(null,"https://other.example/booking","",()=>id).attribution,{});
});
test("propagated session links resume across origins without stale links undoing campaign rotation",()=>{
 const original=resolveBookingSession(null,"https://copperstatebounce.com/","",()=>id);
 const newCampaign=resolveBookingSession(original,qr+"&sv_at="+id,"",()=>next);
 assert.equal(newCampaign.sessionId,next);
 assert.equal(resolveBookingSession(newCampaign,qr+"&sv_at="+id,"",()=>id).sessionId,next);
 const resumed=resolveBookingSession(original,"https://booking.example/book/csb?sv_at="+next,"",()=>id);
 assert.equal(resumed.sessionId,next);
});
function harness(){
 const sessions:any[]=[],snapshots:any[]=[];
 const db:any={async rpc(_name:string,input:any){
  const old=sessions.find(s=>s.id===input.p_session_id);
  if(old&&old.business_id!==input.p_business_id)return {error:{code:"23505"}};
  if(!old)sessions.push({id:input.p_session_id,business_id:input.p_business_id,...input.p_patch});
  return {error:null};
 },from(table:string){const filters:((r:any)=>boolean)[]=[];const q:any={select(){return q;},eq(k:string,v:any){filters.push(r=>r[k]===v);return q;},async maybeSingle(){return {data:sessions.find(r=>filters.every(f=>f(r)))??null,error:null};},async insert(row:any){assert.equal(table,"booking_attribution_snapshots");if(snapshots.some(s=>s.booking_id===row.booking_id))return {error:{code:"23505"}};snapshots.push(row);return {error:null};}};return q;}};
 return {db,sessions,snapshots};
}
test("checkout saves attribution before Stripe even when the earlier analytics request was lost; retries do not duplicate snapshot",async()=>{
 const h=harness();
 const session=await ensureCheckoutAttributionSession(h.db,"csb",id,{...attrs,unsupported:"ignored"});
 assert.equal(session,id);assert.equal(h.sessions.length,1);assert.equal(h.sessions[0].unsupported,undefined);
 for(let i=0;i<2;i++)await snapshotBookingAttribution(h.db,{businessId:"csb",bookingId:"booking",sessionId:session});
 assert.equal(h.snapshots.length,1);assert.equal(h.snapshots[0].utm_campaign,"sandwich_sign");assert.equal(h.snapshots[0].attribution_session_id,id);
 assert.equal(h.snapshots[0].visitor_id,null); // No new consentless cross-session identifier.
 assert.equal(await ensureCheckoutAttributionSession(h.db,"other",id,attrs),null);
 await snapshotBookingAttribution(h.db,{businessId:"other",bookingId:"other-booking",sessionId:id});
 assert.equal(h.snapshots.length,1);
});
test("checkout attribution validates session IDs and trims untrusted attribution fields",async()=>{
 const h=harness();assert.equal(await ensureCheckoutAttributionSession(h.db,"csb","not-a-uuid",attrs),null);
 assert.equal(h.sessions.length,0);
 await ensureCheckoutAttributionSession(h.db,"csb",id,{utm_campaign:" x ",utm_source:42,utm_medium:"a".repeat(900)});
 assert.equal(h.sessions[0].utm_campaign,"x");assert.equal(h.sessions[0].utm_source,null);assert.equal(h.sessions[0].utm_medium.length,500);
});
test("checkout carries raw attribution and saves the snapshot before redirect; completion uses server totals",async()=>{
 const read=(p:string)=>readFile(new URL(`../${p}`,import.meta.url),"utf8");
 const [client,checkout,tracker]=await Promise.all([read("components/PartyRentalBookingClient.tsx"),read("app/api/checkout/route.ts"),read("components/TenantBookingFunnelTracker.tsx")]);
 assert.match(client,/attribution:bookingAttributionValues\(businessSlug\)/);
 assert.ok(checkout.indexOf("await ensureCheckoutAttributionSession")<checkout.indexOf("snapshotBookingAttribution(supabase"));
 assert.match(checkout,/attribution_session_id:body.attributionSessionId/);
 assert.match(checkout,/event:"booking_completed"[\s\S]*?bookingTotalCents:totalCents/);
 assert.match(tracker,/consent!=="granted"\)return null/);
 assert.match(tracker,/servonas\.booking-attribution\.\$\{slug\}/);
});
