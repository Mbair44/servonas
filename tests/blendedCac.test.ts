import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {cacInRange,cacTrend,type CacDay} from "../lib/financial/blendedCac.ts";

const range={start:"2026-10-01",end:"2026-10-02"};
const row=(date:string,google:number,meta:number,customers:number,available=true):CacDay=>({report_date:date,google_spend_cents:google,meta_spend_cents:meta,new_customers:customers,spend_available:available});

test("CAC counts only first-time acquisitions supplied by the tenant-scoped query",()=>{
 const result=cacInRange([row("2026-10-01",10000,5000,2),row("2026-10-02",5000,0,0)],range);
 assert.deepEqual(result,{available:true,spendCents:20000,customers:2,cacCents:10000});
});
test("CAC is an em dash state when no new customers qualify, including verified zero spend",()=>{
 assert.deepEqual(cacInRange([row("2026-10-01",0,0,0),row("2026-10-02",0,0,0)],range),{available:true,spendCents:0,customers:0,cacCents:null});
});
test("missing provider spend never becomes zero CAC",()=>{
 assert.deepEqual(cacInRange([row("2026-10-01",1000,0,1),row("2026-10-02",0,0,1,false)],range),{available:false,spendCents:null,customers:2,cacCents:null});
 assert.equal(cacInRange([],range).available,false);
});
test("comparison periods and chart buckets are calculated independently",()=>{
 const rows=[row("2026-09-30",10000,0,1),row("2026-10-01",20000,0,2),row("2026-10-02",10000,0,1)];
 assert.equal(cacInRange(rows,range).cacCents,10000);
 assert.equal(cacInRange(rows,{start:"2026-09-30",end:"2026-09-30"}).cacCents,10000);
 const trend=cacTrend(rows,range,"day","2026-10-02");
 assert.deepEqual(trend.map(point=>point.cents),[10000,10000]);
});
test("CAC migration enforces paid booking qualification, first acquisition, timezone, and tenant isolation",async()=>{
 const sql=await readFile(new URL("../supabase/migrations/20261020000200_blended_customer_acquisition_cost.sql",import.meta.url),"utf8");
 assert.match(sql,/b\.business_id=p_business_id/);assert.match(sql,/b\.customer_id is not null/);assert.match(sql,/distinct on \(b\.customer_id\)/);assert.match(sql,/b\.status in \('confirmed','paid','completed'\)/);assert.match(sql,/coalesce\(b\.amount_paid_cents,0\)>0/);assert.match(sql,/b\.paid_at is not null/);assert.match(sql,/b\.paid_at at time zone v_timezone/);
 assert.match(sql,/performance\.report_date/);assert.match(sql,/spend_coverage\.report_date/);
 assert.match(sql,/has_business_role\(p_business_id,array\['owner','admin','manager'\]\)/);assert.match(sql,/is_servonas_platform_admin\(\)/);assert.match(sql,/auth\.role\(\)<>'service_role'/);assert.match(sql,/coverage.*provider='google_ads'.*provider='meta'/s);
});
test("both ad providers write verified daily coverage only after their spend upsert succeeds",async()=>{
 const [google,meta]=await Promise.all([readFile(new URL("../lib/googleAdsSpendSync.ts",import.meta.url),"utf8"),readFile(new URL("../lib/metaAdsManagement.ts",import.meta.url),"utf8")]);
 for(const source of [google,meta]){assert.match(source,/business_ad_platform_spend_coverage/);assert.match(source,/onConflict:"business_id,provider,report_date"/);}
 assert.match(google,/const currency=currencies\[0\]\?\?""/);assert.match(meta,/fields=id,account_id,name,account_status,currency/);
});
test("the protected daily Meta sync keeps CAC coverage current without bypassing tenant connections",async()=>{
 const [cron,vercel]=await Promise.all([readFile(new URL("../app/api/cron/meta-ads-spend/route.ts",import.meta.url),"utf8"),readFile(new URL("../vercel.json",import.meta.url),"utf8")]);
 assert.match(cron,/CRON_SECRET/);assert.match(cron,/provider","meta/);assert.match(cron,/external_account_id/);assert.match(cron,/syncMetaAdsPerformance/);assert.match(vercel,/\/api\/cron\/meta-ads-spend/);
});
test("dashboard keeps CAC independent and uses a secondary axis",async()=>{
 const chart=await readFile(new URL("../components/SalesRevenueTrend.tsx",import.meta.url),"utf8"),dashboard=await readFile(new URL("../components/SalesPerformance.tsx",import.meta.url),"utf8");
 assert.match(dashboard,/Blended CAC/);assert.match(dashboard,/sales_performance_blended_cac/);assert.match(chart,/showCac/);assert.match(chart,/cacY/);assert.match(chart,/Ad spend/);assert.match(chart,/New customers/);
});
