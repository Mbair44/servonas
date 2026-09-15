import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {allocateCategoryRevenue,customerCategoryMetrics,type SalesReceipt,comparisonRanges,monthlyAverage,revenueChange,revenueInRange,revenueTrend,salesPerformanceOptions,salesRange,shiftMonth,validSalesDate,type RevenueDay} from "../lib/financial/salesPerformance.ts";
import {dateInTimeZone} from "../lib/bookingTime.ts";
const today="2026-09-14";
test("defaults are this month and rolling twelve monthly points",()=>{
 const result=salesPerformanceOptions({},today);
 assert.deepEqual(result.range,{start:"2026-09-01",end:today});assert.equal(result.trendWindow,12);assert.equal(result.grouping,"month");
 assert.deepEqual(result.trendRange,{start:"2025-10-01",end:today});
});
test("presets produce inclusive dates",()=>{
 assert.deepEqual(salesRange("last_month",today),{start:"2026-08-01",end:"2026-08-31"});
 assert.deepEqual(salesRange("last_90_days",today),{start:"2026-06-17",end:today});
 assert.deepEqual(salesRange("this_year",today),{start:"2026-01-01",end:today});
});
test("month-to-date compares the equivalent elapsed dates",()=>{
 assert.deepEqual(comparisonRanges(salesRange("this_month",today),"this_month"),{previous:{start:"2026-08-01",end:"2026-08-14"},lastYear:{start:"2025-09-01",end:"2025-09-14"}});
});
test("full last month compares full months, including leap years",()=>{
 assert.deepEqual(comparisonRanges(salesRange("last_month","2024-03-10"),"last_month"),{previous:{start:"2024-01-01",end:"2024-01-31"},lastYear:{start:"2023-02-01",end:"2023-02-28"}});
 assert.equal(shiftMonth("2024-03-31",-1),"2024-02-29");assert.equal(shiftMonth("2024-02-29",-12),"2023-02-28");
});
test("custom comparisons use preceding equal-length periods",()=>{
 assert.deepEqual(comparisonRanges({start:"2026-03-01",end:"2026-03-07"},"custom").previous,{start:"2026-02-22",end:"2026-02-28"});
});
test("invalid, reversed, future, and overly long custom ranges are rejected",()=>{
 assert.equal(validSalesDate("2026-02-30"),false);assert.equal(validSalesDate("no date"),false);
 for(const [start,end] of [["2026-02-30",today],[today,"2026-09-01"],[today,"2026-09-15"],["2000-01-01",today]])assert.throws(()=>salesRange("custom",today,start,end));
});
test("date boundaries follow the business time zone",()=>{
 assert.equal(dateInTimeZone(new Date("2026-09-01T02:00:00Z"),"America/Phoenix"),"2026-08-31");
 assert.equal(dateInTimeZone(new Date("2026-03-08T07:30:00Z"),"America/New_York"),"2026-03-08");
});
test("revenue sums collected daily amounts inclusively and excludes outside dates",()=>{
 const rows=[{date:"2026-08-31",cents:900},{date:"2026-09-01",cents:1000},{date:today,cents:2000},{date:"2026-09-15",cents:900}];
 assert.equal(revenueInRange(rows,salesRange("this_month",today)),3000);
});
test("comparisons never divide by zero",()=>{
 assert.equal(revenueChange(100,0),null);assert.equal(revenueChange(0,0),null);assert.equal(revenueChange(11800,10000),18);assert.equal(revenueChange(0,10000),-100);
});
test("monthly average uses only available completed months and includes zero months",()=>{
 const rows=[{date:"2026-06-15",cents:9000},{date:"2026-08-01",cents:3000},{date:"2026-09-05",cents:999999}];
 assert.deepEqual(monthlyAverage(rows,"2026-06-15",today),{cents:4000,months:3});
});
test("new tenants have no average until a historical month is complete",()=>{
 assert.deepEqual(monthlyAverage([],null,today),{cents:null,months:0});assert.deepEqual(monthlyAverage([{date:today,cents:900}],today,today),{cents:null,months:0});
});
test("twelve-month average excludes older payments and the current month",()=>{
 assert.deepEqual(monthlyAverage([{date:"2025-08-31",cents:100000},{date:"2025-09-01",cents:12000},{date:"2026-09-01",cents:99999}],"2020-01-01",today),{cents:1000,months:12});
});
test("trend zero-fills months, includes last-month boundaries and marks current month partial",()=>{
 const result=revenueTrend([{date:"2026-07-31",cents:100},{date:"2026-09-14",cents:500}],{start:"2026-07-01",end:today},"month",today);
 assert.deepEqual(result.map(row=>row.cents),[100,0,500]);assert.equal(result[2].partial,true);assert.equal(result[1].partial,false);
});
test("6M / 12M / 24M have the expected number of points",()=>{
 for(const months of [6,12,24]){const options=salesPerformanceOptions({salesTrend:String(months)},today);assert.equal(revenueTrend([],options.trendRange,options.grouping,today).length,months);}
});
test("short custom ranges use daily or weekly grouping and preserve total",()=>{
 const daily=salesPerformanceOptions({salesPeriod:"custom",salesStart:"2026-09-01",salesEnd:today},today);assert.equal(daily.grouping,"day");assert.equal(daily.trendWindow,0);
 const weekly=salesPerformanceOptions({salesPeriod:"custom",salesStart:"2026-07-01",salesEnd:today},today);assert.equal(weekly.grouping,"week");
 const rows:RevenueDay[]=[{date:"2026-07-01",cents:100},{date:"2026-07-08",cents:200},{date:today,cents:300}];
 assert.equal(revenueTrend(rows,weekly.trendRange,"week",today).reduce((sum,row)=>sum+row.cents,0),600);
});
test("selected custom ranges can switch back to rolling charts",()=>{
 const options=salesPerformanceOptions({salesPeriod:"custom",salesStart:"2026-09-01",salesEnd:today,salesTrend:"24"},today);assert.equal(options.trendWindow,24);assert.equal(options.grouping,"month");
});
const migration=()=>readFile(new URL("../supabase/migrations/20260914000600_sales_performance.sql",import.meta.url),"utf8");
test("tenant managers and Servonas platform admins can see Sales Performance",async()=>{
 const dashboard=await readFile(new URL("../app/app/[businessSlug]/page.tsx",import.meta.url),"utf8");
 assert.match(dashboard,/\["owner","admin","manager","platform_admin"\]\.includes\(role\).*<SalesPerformance/);
});
test("Sales Performance RPCs authorize the verified platform-admin server path",async()=>{
 const sql=await readFile(new URL("../supabase/migrations/20260915000100_platform_admin_sales_performance.sql",import.meta.url),"utf8");
 for(const name of ["financial_collected_payment_details","financial_collected_payments","sales_performance_summary","sales_performance_details"])assert.match(sql,new RegExp(`create or replace function public\\.${name}`));
 assert.equal((sql.match(/auth\.role\(\)<>\'service_role\'.*public\.is_servonas_platform_admin\(\)/g)??[]).length,3);
 assert.match(sql,/to authenticated,service_role/);
 assert.doesNotMatch(sql,/security definer/);
});
test("sales and the existing dashboard share a tenant-authorized collection source",async()=>{
 const sql=await migration();assert.match(sql,/financial_dashboard_summary/);assert.equal((sql.match(/from public.financial_collected_payments\(p_business_id\)/g)??[]).length,2);
 assert.match(sql,/p\.booking_id is null or p\.invoice_id is not null/);assert.match(sql,/p\.status in\('succeeded','partially_refunded','refunded'\)/);
 assert.match(sql,/coalesce\(p\.paid_at,p\.received_at\)/);assert.match(sql,/coalesce\(b\.refunded_cents,0\)/);assert.match(sql,/security invoker/);assert.match(sql,/array\['owner','admin','manager'\]/);assert.doesNotMatch(sql,/create table/i);
});
test("outstanding invoices do not count a booking twice or reopen refunded debt",async()=>{
 const sql=await migration();assert.match(sql,/i\.grand_total_cents-i\.amount_paid_cents/);assert.match(sql,/i\.balance_due_cents/);
 assert.match(sql,/b\.status in\('confirmed','paid','completed'\)/);assert.match(sql,/i\.status in\('sent','viewed','partially_paid','overdue'\)/);
 assert.match(sql,/b\.status in\('cancelled','canceled','expired','refunded'\)/);assert.match(sql,/i\.job_id=b\.job_id and not i\.is_deleted and i\.status<>'void'/);assert.match(sql,/j\.is_deleted or j\.status='canceled'/);
});


const selected={start:"2026-09-01",end:"2026-09-14"};
const receipt=(cents:number,customerKey:string|null="customer:1",date="2026-09-10",weights=[{category:"Tenant category",cents:100}]):SalesReceipt=>({date,cents,customerKey,weights});
test("customer average deduplicates deposits, balances, and repeat bookings",()=>{
 const result=customerCategoryMetrics([receipt(5000),receipt(7500),receipt(2500),receipt(5000,"customer:2")],selected);
 assert.equal(result.customerCount,2);assert.equal(result.averageCents,10000);assert.equal(result.revenueCents,20000);
});
test("customer metrics use the selected and comparison dates independently",()=>{
 const rows=[receipt(10000),receipt(5000,"customer:2","2026-08-10"),receipt(2500,"customer:3","2025-09-10")];
 const current=customerCategoryMetrics(rows,selected),comparisons=comparisonRanges(selected,"this_month");
 assert.equal(revenueChange(current.averageCents!,customerCategoryMetrics(rows,comparisons.previous).averageCents!),100);
 assert.equal(revenueChange(current.averageCents!,customerCategoryMetrics(rows,comparisons.lastYear).averageCents!),300);
 assert.equal(current.categories[0].cents,10000);
});
test("zero receipts and fully refunded customers have a clean empty state",()=>{
 const result=customerCategoryMetrics([receipt(0)],selected);
 assert.equal(result.customerCount,0);assert.equal(result.averageCents,null);assert.deepEqual(result.categories,[]);
});
test("unidentified payments never fabricate unique customers or inflate the average",()=>{
 const result=customerCategoryMetrics([receipt(5000),receipt(2000,null)],selected);
 assert.equal(result.averageCents,null);assert.equal(result.unidentifiedCents,2000);assert.equal(result.categories[0].cents,7000);
});
test("partial payments allocate discounted item amounts, fees and tax",()=>{
 // Two lines after discounts: $150 and $75, plus $25 delivery and $10 tax.
 const result=customerCategoryMetrics([receipt(13000,"customer:1","2026-09-10",[
  {category:"Category A",cents:15000},{category:"Category B",cents:7500},{category:"Delivery / Fees",cents:2500},{category:"Tax",cents:1000}
 ])],selected);
 assert.deepEqual(result.categories.map(({category,cents})=>({category,cents})),[
  {category:"Category A",cents:7500},{category:"Category B",cents:3750},{category:"Delivery / Fees",cents:1250},{category:"Tax",cents:500}
 ]);
 assert.ok(Math.abs(result.categories.reduce((sum,row)=>sum+row.percent,0)-100)<1e-10);
});
test("net refunded receipts reduce every category proportionally",()=>{
 const weights=[{category:"A",cents:30000},{category:"B",cents:10000}];
 assert.deepEqual(allocateCategoryRevenue(10000,weights),[{category:"A",cents:7500},{category:"B",cents:2500}]);
});
test("category allocation reconciles cents across fractional weights and repeated categories",()=>{
 for(let cents=1;cents<100;cents++){
  const shares=allocateCategoryRevenue(cents,[{category:"A",cents:1/3},{category:"B",cents:1/3},{category:"A",cents:1/3}]);
  assert.equal(shares.reduce((sum,row)=>sum+row.cents,0),cents);assert.equal(shares.length,2);
  assert.ok(shares.every(row=>Number.isInteger(row.cents)&&row.cents>=0));
 }
});
test("missing and zero-valued line details preserve uncategorized revenue",()=>{
 assert.deepEqual(allocateCategoryRevenue(123,[]),[{category:"Uncategorized",cents:123}]);
 assert.deepEqual(allocateCategoryRevenue(123,[{category:"A",cents:0}]),[{category:"Uncategorized",cents:123}]);
});
test("new detail RPC reuses tenant-guarded receipts and stored line pricing",async()=>{
 const sql=await readFile(new URL("../supabase/migrations/20260914000700_sales_customer_categories.sql",import.meta.url),"utf8");
 assert.match(sql,/financial_collected_payment_details\(p_business_id\)/);
 assert.match(sql,/p.booking_id is null or p.invoice_id is not null/);
 assert.match(sql,/security invoker/);assert.match(sql,/has_business_role/);
 assert.match(sql,/li.line_total_cents-li.tax_amount_cents/);
 assert.match(sql,/bi.unit_price_cents::numeric\*bi.quantity/);
 assert.match(sql,/coalesce\(b.discount_cents,0\)/);
 assert.match(sql,/rc.business_id=p_business_id/);assert.match(sql,/pc.business_id=p_business_id/);
 assert.match(sql,/booking.job_id=i.job_id/);assert.match(sql,/'Delivery \/ Fees'/);
 assert.match(sql,/greatest\(r.amount_cents-r.refunded_amount_cents,0\)/);
 assert.doesNotMatch(sql,/create table|security definer/i);
});
