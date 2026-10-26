import test,{afterEach} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {activateGoogleAdsTag,normalizeGoogleAdsTagId,isPlatformGoogleAdsPath,updateGoogleAdsConsent} from "../lib/googleTag.ts";
import {buildGoogleAdsBookingConversionPayload,normalizeGoogleAdsConversionDestination,trackGoogleAdsConversion,trackGoogleAdsBookingConversion,trackGoogleAdsSignupConversion,verifiedGoogleAdsPaidBooking} from "../lib/googleAds.ts";

const csb="AW-18406171248",other="AW-12345678901";
function browser(consent:string|null="granted",existing?:"gtag"|"ga4"|"gtm"){
 const calls:unknown[][]=[],scripts:{src:string;async?:boolean}[]=existing==="ga4"?[{src:"https://www.googletagmanager.com/gtag/js?id=G-EXISTING"}]:existing==="gtm"?[{src:"https://www.googletagmanager.com/gtm.js?id=GTM-EXISTING"}]:[];
 const storage=new Map<string,string>();
 const state={consent};
 const localStorage=new Map<string,string>();
 const win={location:{pathname:"/sites/copper-state-bounce",hostname:"servonas.com",href:"https://servonas.com/sites/copper-state-bounce"},localStorage:{getItem:(key:string)=>key==="servonas.analytics_consent"?state.consent:localStorage.get(key)??null,setItem:(key:string,value:string)=>localStorage.set(key,value)},sessionStorage:{getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value)},dataLayer:[] as IArguments[],gtag:existing==="gtag"?((...args:unknown[])=>calls.push(args)):undefined};
 Object.defineProperty(globalThis,"window",{value:win,configurable:true});
 Object.defineProperty(globalThis,"document",{value:{scripts,createElement:()=>({}),head:{appendChild:(script:{src:string})=>scripts.push(script)}},configurable:true});
 return {win,state,scripts,events:()=>existing==="gtag"?calls:win.dataLayer.map(args=>Array.from(args))};
}
afterEach(()=>{Reflect.deleteProperty(globalThis,"window");Reflect.deleteProperty(globalThis,"document");});

const denied={ad_storage:"denied",analytics_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"};
const granted={ad_storage:"granted",analytics_storage:"granted",ad_user_data:"granted",ad_personalization:"denied"};
test("CSB base tag loads with denied defaults before any config or event",()=>{
 const b=browser(null);
 assert.ok(activateGoogleAdsTag(csb,"csb"));
 assert.equal(b.scripts[0].src,`https://www.googletagmanager.com/gtag/js?id=${csb}`);assert.equal(b.scripts[0].async,true);
 assert.deepEqual(b.events()[0],["consent","default",denied]);
 assert.deepEqual(b.events().slice(2),[["config",csb,{send_page_view:false,groups:"servonas_csb_AW_18406171248"}],["event","page_view",{send_to:csb}]]);
 assert.equal(trackGoogleAdsConversion({sendTo:`${csb}/test_label`}),false);
 assert.equal(b.events().some(e=>e[1]==="conversion"),false);
});
test("existing choice updates consent, including revocation, without reloading",()=>{
 const b=browser(null);activateGoogleAdsTag(csb,"csb");
 b.state.consent="granted";updateGoogleAdsConsent();updateGoogleAdsConsent();
 assert.deepEqual(b.events().at(-1),["consent","update",granted]);
 assert.equal(b.events().filter(e=>e[1]==="update").length,1);
 b.state.consent="denied";updateGoogleAdsConsent();
 assert.deepEqual(b.events().at(-1),["consent","update",denied]);
 assert.equal(trackGoogleAdsConversion({sendTo:`${csb}/test_label`}),false);assert.equal(b.scripts.length,1);
});
test("returning consent is restored after denied defaults and before config",()=>{
 const b=browser("granted");activateGoogleAdsTag(csb,"csb");
 assert.deepEqual(b.events().slice(0,2),[["consent","default",denied],["consent","update",granted]]);
});
test("missing and invalid IDs cannot load scripts or inject code",()=>{
 const b=browser();
 for(const id of [null,undefined,"","G-123456789","AW-123<script>","aw-18406171248","AW-123/label","AW-123","AW-"+"1".repeat(21)]){
  assert.equal(normalizeGoogleAdsTagId(id),null);assert.equal(activateGoogleAdsTag(id,"csb"),null);
 }
 assert.equal(normalizeGoogleAdsTagId(` ${csb} `),csb);assert.equal(b.scripts.length,0);
});
test("repeated mounting and tenant navigation share one loader without sharing destinations",()=>{
 const b=browser();const release=activateGoogleAdsTag(csb,"csb")!;
 activateGoogleAdsTag(csb,"csb");assert.equal(b.events().filter(e=>e[0]==="config").length,1);
 b.win.location.pathname="/sites/other";b.win.location.href="https://servonas.com/sites/other";
 activateGoogleAdsTag(other,"other");release();
 assert.equal(b.scripts.length,1);
 assert.equal(trackGoogleAdsConversion({sendTo:`${csb}/test_label`}),false);
 assert.equal(trackGoogleAdsConversion({sendTo:`${other}/test_label`}),true);
 assert.equal(trackGoogleAdsSignupConversion("user"),false);
 assert.deepEqual(b.events().filter(e=>e[1]==="page_view").map(e=>e[2]),[{send_to:csb},{send_to:other}]);
});
for(const existing of ["gtag","ga4"] as const)test(`reuses existing ${existing} infrastructure`,()=>{
 const b=browser("granted",existing),before=b.scripts.length;
 activateGoogleAdsTag(csb,"csb");assert.equal(b.scripts.length,before);assert.ok(b.events().some(e=>e[0]==="config"&&e[1]===csb));
});
test("conversion requires configured destination, real label, consent, and gtag; dedupes transaction",()=>{
 const b=browser();
 assert.equal(trackGoogleAdsConversion({sendTo:`${csb}/test_label`}),false);
 const release=activateGoogleAdsTag(csb,"csb")!;
 assert.equal(trackGoogleAdsConversion({sendTo:csb}),false);
 assert.equal(trackGoogleAdsConversion({sendTo:`${csb}/`}),false);
 const input={sendTo:`${csb}/test_label`,value:42,currency:"USD",transactionId:"booking-1"};
 b.state.consent="denied";assert.equal(trackGoogleAdsConversion(input),false);
 b.state.consent="granted";const gtag=b.win.gtag;b.win.gtag=undefined;assert.equal(trackGoogleAdsConversion(input),false);b.win.gtag=gtag;
 assert.equal(trackGoogleAdsConversion(input),true);assert.equal(trackGoogleAdsConversion(input),false);
 assert.deepEqual(b.events().at(-1),["event","conversion",{send_to:input.sendTo,value:42,currency:"USD",transaction_id:"booking-1"}]);
 release();assert.equal(trackGoogleAdsConversion({...input,transactionId:"new"}),false);
 assert.equal(trackGoogleAdsBookingConversion({bookingId:"booking-1",destination:`${csb}/test_label`,value:42}),false);
});
test("booking conversion sends the full configured amount once with the immutable booking ID",()=>{
 const b=browser("granted");activateGoogleAdsTag(csb,"csb");
 const destination=`${csb}/dJbiCJve5ZodEPDE38hE`;
 assert.equal(normalizeGoogleAdsConversionDestination(destination,csb),destination);
 assert.equal(normalizeGoogleAdsConversionDestination(destination,other),null);
 assert.equal(trackGoogleAdsBookingConversion({bookingId:"4d660171-7b03-4a31-83cd-a1d57da46443",destination,value:345,currency:"USD"}),true);
 assert.equal(trackGoogleAdsBookingConversion({bookingId:"4d660171-7b03-4a31-83cd-a1d57da46443",destination,value:345,currency:"USD"}),false);
 assert.deepEqual(b.events().at(-1),["event","conversion",{send_to:destination,value:345,currency:"USD",transaction_id:"4d660171-7b03-4a31-83cd-a1d57da46443"}]);
});
test("booking conversion payload can be inspected without dispatching a Google event",()=>{
 const destination=`${csb}/dJbiCJve5ZodEPDE38hE`;
 assert.deepEqual(buildGoogleAdsBookingConversionPayload({bookingId:"4d660171-7b03-4a31-83cd-a1d57da46443",destination,value:345,currency:"USD"}),{send_to:destination,value:345,currency:"USD",transaction_id:"4d660171-7b03-4a31-83cd-a1d57da46443"});
 assert.equal(buildGoogleAdsBookingConversionPayload({bookingId:"booking",destination:`${other}/label`,value:-1}),null);
});

test("legacy public-booking purchases require a confirmed paid booking and use its canonical ID and full total",()=>{
 const paid={id:"4d660171-7b03-4a31-83cd-a1d57da46443",status:"confirmed",total_cents:34500,amount_paid_cents:10000,paid_at:"2026-10-26T12:00:00.000Z"};
 assert.deepEqual(verifiedGoogleAdsPaidBooking(paid),{bookingId:paid.id,totalCents:34500});
 for(const booking of [{...paid,amount_paid_cents:0},{...paid,paid_at:null},{...paid,status:"paid"},null])assert.equal(verifiedGoogleAdsPaidBooking(booking),null);
});
test("private/preview paths and platform tag on tenant paths never track",()=>{
 const b=browser();
 for(const path of ["/app/csb","/tech/jobs","/sites/preview/csb"]){b.win.location.pathname=path;assert.equal(activateGoogleAdsTag(csb,"csb"),null);}
 for(const path of ["/sites/csb","/book/csb","/booking","/success"]){b.win.location.pathname=path;assert.equal(isPlatformGoogleAdsPath(path),false);assert.equal(activateGoogleAdsTag(other,"platform"),null);}
 b.win.location.pathname="/";b.win.location.hostname="copperstatebounce.com";assert.equal(activateGoogleAdsTag(other,"platform"),null);
 assert.equal(b.scripts.length,0);
});
test("unavailable storage and server execution safely no-op",()=>{
 assert.equal(trackGoogleAdsConversion({sendTo:`${csb}/test_label`}),false);
 const b=browser();b.win.localStorage.getItem=()=>{throw new Error("blocked");};
 assert.ok(activateGoogleAdsTag(csb,"csb"));assert.deepEqual(b.events()[0],["consent","default",denied]);assert.equal(trackGoogleAdsConversion({sendTo:`${csb}/test_label`}),false);
});
test("schema seed, authorized settings, and public route resolution remain tenant scoped",async()=>{
 const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
 const migration=await read("supabase/migrations/20261012000400_business_google_ads_tag.sql");
 assert.match(migration,/where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed'/);
 assert.match(migration,/google_ads_tag_id='AW-18406171248'/);assert.match(migration,/check \(google_ads_tag_id is null/);
 const action=await read("app/app/[businessSlug]/settings/website/actions.ts");
 assert.match(action,/requireWorkspaceCapability/);assert.match(action,/canManageBusiness\(role\)/);assert.match(action,/google_ads_tag_id:googleAdsTagId/);assert.match(action,/business_id:business.id/);assert.match(action,/rawGoogleAdsTagId&&!googleAdsTagId/);
 const hosted=await read("app/sites/[siteSlug]/layout.tsx"),domain=await read("app/sites/domain/[domain]/layout.tsx"),booking=await read("app/book/[businessSlug]/layout.tsx");
 assert.match(hosted,/ilike\("public_slug",siteSlug\).eq\("status","published"\)/);
 assert.match(domain,/loadPublishedBusinessWebsiteByDomain\(domain\)/);
 assert.match(booking,/eq\("business_id",booking.business_id\)/);
 for(const source of [hosted,domain,booking]){assert.match(source,/normalizeGoogleAdsTagId/);assert.doesNotMatch(source,/AW-18406171248/);}
});

test("a GTM container alone is not a Google destination loader",()=>{
 const b=browser("granted","gtm");
 activateGoogleAdsTag(csb,"csb");activateGoogleAdsTag(csb,"csb");
 assert.equal(b.scripts.filter(s=>s.src.includes("/gtag/js")).length,1);
});

test("PostgreSQL migration seeds only CSB and enforces valid IDs",{skip:!process.env.PGLITE_RUNTIME},async()=>{
 const {pathToFileURL}=await import("node:url");
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_RUNTIME!).href),db=new PGlite();
 try{
  await db.exec("create table business_website_settings(business_id uuid primary key); insert into business_website_settings values ('cb25acc0-3623-4c06-9041-89a88f4ad6ed'),('11111111-1111-1111-1111-111111111111');");
  await db.exec(await readFile(new URL("../supabase/migrations/20261012000400_business_google_ads_tag.sql",import.meta.url),"utf8"));
  const {rows}=await db.query("select * from business_website_settings order by business_id");
  assert.equal(rows[0].google_ads_tag_id,null);assert.equal(rows[1].google_ads_tag_id,csb);
  await assert.rejects(db.query("update business_website_settings set google_ads_tag_id='AW-bad'"));
 }finally{await db.close();}
});
