import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {availablePaidSpend,sourcePaidEconomics,totalPaidEconomics,formatPaidRoas} from "../lib/paidSourceEconomics.ts";
import type {AdPlatformStatusSummary} from "../lib/adPlatform.ts";
const statuses=[{provider:"google_ads",state:"connected_with_data",spendCents:59509,lastSyncError:null},{provider:"meta",state:"connected_with_data",spendCents:78128,lastSyncError:null}] satisfies Array<Pick<AdPlatformStatusSummary,"provider"|"state"|"spendCents"|"lastSyncError">>;
const currency=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value/100);

test("Meta and Google paid rows calculate economics from existing platform spend",()=>{
 const meta=sourcePaidEconomics("meta_ads",103750,6,statuses);
 assert.equal(meta.spendCents,78128);assert.equal(formatPaidRoas(meta.roas),"1.33x");assert.equal(currency(meta.costPerBookingCents!),"$130.21");
 const google=sourcePaidEconomics("google_ads",0,0,statuses);
 assert.equal(google.spendCents,59509);assert.equal(formatPaidRoas(google.roas),"0.00x");assert.equal(google.costPerBookingCents,null);
});
test("non-paid sources never get paid economics even when they produce revenue",()=>{
 for(const source of ["google_business_profile","direct","organic","referral","email","unknown","google"]){assert.deepEqual(sourcePaidEconomics(source,20000,1,statuses),{spendCents:null,roas:null,costPerBookingCents:null});}
});
test("combined paid metrics exclude all non-paid revenue and bookings",()=>{
 const rows=[{source:"google_ads",revenueCents:0,bookings:0},{source:"facebook",revenueCents:100000,bookings:5},{source:"instagram",revenueCents:3750,bookings:1},{source:"organic",revenueCents:20000,bookings:1},{source:"google_business_profile",revenueCents:27500,bookings:1},{source:"direct",revenueCents:22500,bookings:6}];
 const total=totalPaidEconomics(rows,statuses);
 assert.equal(total.spendCents,137637);assert.equal(total.revenueCents,103750);assert.equal(total.bookings,6);
 assert.equal(formatPaidRoas(total.roas),"0.75x");assert.equal(currency(total.costPerBookingCents!),"$229.40");
 assert.notEqual(total.roas,rows.reduce((sum,r)=>sum+r.revenueCents,0)/137637);
});
test("missing, failed, pending and invalid spend is unavailable, never silently zero",()=>{
 assert.equal(availablePaidSpend(undefined),null);
 for(const state of ["not_connected","connected_never_synced","syncing","sync_error","authorization_expired"] as const){assert.equal(availablePaidSpend({...statuses[0],state}),null);}
 assert.equal(availablePaidSpend({...statuses[0],spendAvailable:false}),null);
 assert.equal(availablePaidSpend({...statuses[0],lastSyncError:"stale after failed sync"}),null);
 assert.equal(availablePaidSpend({...statuses[0],spendCents:NaN}),null);
 assert.equal(totalPaidEconomics([{source:"meta_ads",revenueCents:10000,bookings:1}],statuses.slice(1)).spendCents,null);
 assert.deepEqual(sourcePaidEconomics("google_ads",0,0,[]),{spendCents:null,roas:null,costPerBookingCents:null});
 const zero=sourcePaidEconomics("google_ads",10000,1,[{...statuses[0],state:"connected_synced_no_data",spendCents:0}]);
 assert.equal(zero.spendCents,0);assert.equal(zero.roas,null);assert.equal(zero.costPerBookingCents,0);
});
test("platform loader respects selected dates and reports missing Google/failed Meta reads",async()=>{
 const ts=await import("typescript");
 const source=await readFile(new URL("../lib/adPlatform.ts",import.meta.url),"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:any={};new Function("require","exports",code)(()=>({getSupabaseAdmin:()=>null}),exports);
 for(const [from,to,spend] of [["2026-09-01T07:00:00Z","2026-09-25T07:00:00Z",781.28],["2026-08-01T07:00:00Z","2026-09-01T07:00:00Z",200]] as const){
  for(const failed of [false,true]){
   const reads:Array<{table:string;filters:Record<string,unknown>}>=[];
   const db={from(table:string){const call={table,filters:{} as Record<string,unknown>};reads.push(call);const q:any={};for(const method of ["select","maybeSingle","in"]){q[method]=()=>q;}for(const method of ["eq","gte","lt"]){q[method]=(key:string,value:unknown)=>{call.filters[`${method}:${key}`]=value;return q;};}q.then=(resolve:any)=>Promise.resolve({data:table==="business_ad_platform_connections"?{status:"connected_with_data"}:table==="business_google_ads_connections"?{status:"connected",google_ads_customer_id:"123"}:table==="business_ad_platform_daily_performance"?[{spend_amount:spend}]:[],error:failed&&table==="business_ad_platform_daily_performance"?{message:"Read failed"}:null}).then(resolve);return q;}};
   const result:AdPlatformStatusSummary[]=await exports.loadAdPlatformStatuses(db,"tenant-a",from,to,failed?null:59509);
   const metaRead=reads.find(r=>r.table==="business_ad_platform_daily_performance")!;
   assert.equal(metaRead.filters["gte:report_date"],from.slice(0,10));assert.equal(metaRead.filters["lt:report_date"],to.slice(0,10));
   assert.ok(reads.every(r=>r.filters["eq:business_id"]==="tenant-a"));
   assert.equal(availablePaidSpend(result[0]),failed?null:59509);assert.equal(availablePaidSpend(result[1]),failed?null:Math.round(spend*100));
  }
 }
});
test("table and cards share spend and selected window; total uses unfiltered paid bookings",async()=>{
 const page=await readFile(new URL("../app/app/[businessSlug]/marketing/funnel/page.tsx",import.meta.url),"utf8");
 assert.match(page,/loadAdPlatformStatuses\(supabase, business.id, window.from, window.to, spendBySource.google_ads \?\? null\)/);
 assert.match(page,/gte\("created_at", window.from\).lt\("created_at", window.to\)/);
 assert.match(page,/totalPaidEconomics\(buildSourcePerformanceReport\(\[\],allAttributedBookings\).summaries,adPlatformStatuses\)/);
 assert.match(page,/sourcePaidEconomics\(row.key,row.revenueCents,row.bookings,adPlatformStatuses\)/);
 assert.match(page,/availablePaidSpend\(status\)/);
 assert.match(page,/Paid ROAS<\/small>/);assert.match(page,/Paid cost \/ booking<\/small>/);
 assert.match(page,/paidEconomicsHelp.totalRoas/);
 const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
 assert.match(css,/marketing-traffic-sources-table\{overflow-x:auto\}/);assert.match(css,/position:sticky;left:0/);
});
