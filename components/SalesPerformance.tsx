import Link from "next/link";
import type {SupabaseClient} from "@supabase/supabase-js";
import {formatCents} from "@/lib/financial/priceBook";
import {customerCategoryMetrics,monthlyAverage,revenueChange,revenueInRange,revenueTrend,salesPerformanceOptions,type RevenuePoint,type SalesData,type SalesReceipt} from "@/lib/financial/salesPerformance";
import {SalesPerformanceFilters} from "./SalesPerformanceFilters";
import styles from "./SalesPerformance.module.css";
function Comparison({current,prior,label}:{current:number;prior:number|null;label:string}){
 const change=prior==null?null:revenueChange(current,prior),rounded=change==null?null:Math.round(change);
 return <p className={change!=null&&change>0?styles.increase:change!=null&&change<0?styles.decrease:styles.muted}>{prior==null?`Earlier customer data is unavailable ${label}.`:rounded==null?`No earlier revenue to compare ${label}`:`${rounded>0?"↑":rounded<0?"↓":"→"} ${Math.abs(rounded).toLocaleString("en-US")}% ${label}`}</p>;
}
function Trend({points,description}:{points:RevenuePoint[];description:string}){
 const width=800,height=260,left=68,right=22,top=22,bottom=45,plotWidth=width-left-right,plotHeight=height-top-bottom;
 const max=Math.max(100,...points.map(point=>point.cents)),x=(index:number)=>left+(points.length>1?index/(points.length-1):.5)*plotWidth,y=(cents:number)=>top+plotHeight*(1-cents/max);
 const ticks=new Set([0,...points.map((_,i)=>i).filter(i=>i%Math.max(1,Math.ceil(points.length/6))===0),points.length-1]);
 const compact=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1}).format(cents/100);
 return <><div className={styles.chartScroll} tabIndex={0} role="region" aria-label="Revenue chart; scroll horizontally on smaller screens"><svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="sales-trend-title sales-trend-description"><title id="sales-trend-title">Collected revenue trend</title><desc id="sales-trend-description">{description}. Exact amounts are available in the table below.</desc>{[0,.5,1].map(fraction=><g key={fraction}><line x1={left} y1={y(max*fraction)} x2={width-right} y2={y(max*fraction)} stroke="#e5eaf0"/><text x={left-10} y={y(max*fraction)+4} textAnchor="end" fill="#64748b" fontSize="12">{compact(max*fraction)}</text></g>)}<polyline fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={points.map((point,index)=>`${x(index)},${y(point.cents)}`).join(" ")}/>{points.map((point,index)=><g key={point.date}><circle cx={x(index)} cy={y(point.cents)} r="4" fill={point.partial?"#fff":"#2563eb"} stroke="#2563eb" strokeWidth="2"><title>{point.label}: {formatCents(point.cents)}{point.partial?" (so far)":""}</title></circle>{ticks.has(index)&&<text x={x(index)} y={height-16} textAnchor={index===0?"start":index===points.length-1?"end":"middle"} fill="#64748b" fontSize="12">{point.label.replace("Week of ","")}</text>}</g>)}</svg></div>
 <details className={styles.table}><summary>View revenue amounts</summary><table><caption className="sr-only">{description}</caption><thead><tr><th scope="col">Period</th><th scope="col">Revenue</th></tr></thead><tbody>{points.map(point=><tr key={point.date}><th scope="row">{point.label}{point.partial?" · so far":""}</th><td>{formatCents(point.cents)}</td></tr>)}</tbody></table></details></>;
}
export async function SalesPerformance({db,businessId,businessSlug,today,query}:{db:SupabaseClient;businessId:string;businessSlug:string;today:string;query:Record<string,string|undefined>}){
 let options,rangeError:string|undefined;
 try{options=salesPerformanceOptions(query,today);}catch(error){rangeError=error instanceof Error?error.message:"Choose a valid date range.";options=salesPerformanceOptions({},today);}
 const {period,range,comparisons,trendWindow,trendRange,grouping,from}=options;
 const [{data,error},details]=await Promise.all([
  db.rpc("sales_performance_summary",{p_business_id:businessId,p_from:from,p_through:today}),
  db.rpc("sales_performance_details",{p_business_id:businessId,p_from:from,p_through:today})
 ]);
 const action=`/app/${businessSlug}`;
 if(error||!data){console.error("Sales performance unavailable",{businessId,code:error?.code});return <section id="sales-performance" className={`executive-card ${styles.section}`} aria-labelledby="sales-heading"><h2 id="sales-heading">Sales Performance</h2><p role="status">Sales performance is temporarily unavailable. Your bookings and payments are unaffected.</p></section>;}
 const sales=data as SalesData,daily=sales.daily??[],revenue=revenueInRange(daily,range),average=monthlyAverage(daily,sales.firstCollectedDate,today),points=revenueTrend(daily,trendRange,grouping,today);
 const receipts=(details.data??[]) as SalesReceipt[];
 const customerMetrics=customerCategoryMetrics(receipts,range),previousCustomers=customerCategoryMetrics(receipts,comparisons.previous),lastYearCustomers=customerCategoryMetrics(receipts,comparisons.lastYear);
 const detailsAvailable=!details.error&&details.data!=null&&customerMetrics.revenueCents===revenue;
 const previousAvailable=previousCustomers.revenueCents===revenueInRange(daily,comparisons.previous);
 const lastYearAvailable=lastYearCustomers.revenueCents===revenueInRange(daily,comparisons.lastYear);
 const previousLabel=period==="this_month"?"vs last month (same dates)":period==="last_month"?"vs the month before":"vs the previous equal-length period";
 const trendLink=(value:string)=>{const params=new URLSearchParams({salesPeriod:period,salesTrend:value});if(period==="custom"){params.set("salesStart",range.start);params.set("salesEnd",range.end);}return `${action}?${params}#sales-performance`;};
 const dateLabel=(date:string)=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
 return <section id="sales-performance" className={styles.section} aria-labelledby="sales-heading">
  <div className="section-heading"><div><span>Your business at a glance</span><h2 id="sales-heading">Sales Performance</h2></div></div>
  <SalesPerformanceFilters key={`${period}:${range.start}:${range.end}`} period={period} range={range} today={today} action={action}/>
  {rangeError&&<p className="workspace-notice error" role="alert">{rangeError} Showing This Month.</p>}
  <p className={styles.period}>{dateLabel(range.start)} – {dateLabel(range.end)} · Dates follow your business time zone.</p>
  <div className={styles.metrics}>
   <article className="executive-card"><span className={styles.label}>Revenue</span><strong className={styles.amount}>{formatCents(revenue)}</strong><p className={styles.muted}>Money collected, less refunds</p><Comparison current={revenue} prior={revenueInRange(daily,comparisons.previous)} label={previousLabel}/><Comparison current={revenue} prior={revenueInRange(daily,comparisons.lastYear)} label="vs the same period last year"/></article>
   <article className="executive-card"><span className={styles.label}>Outstanding Revenue</span><strong className={styles.amount}>{formatCents(Number(sales.outstandingCents))}</strong><p className={styles.muted}>Still owed today across all active bookings and invoices. Each balance is counted once.</p><Link href={`/app/${businessSlug}/invoices`}>View invoices →</Link></article>
   <article className="executive-card"><span className={styles.label}>Average Monthly Revenue</span><strong className={styles.amount}>{average.cents==null?"—":formatCents(average.cents)}</strong><p className={styles.muted}>{average.months?`Based on ${average.months===12?"the last 12":average.months} completed month${average.months===1?"":"s"}.`:"Available after your first month with payment history ends."}</p>{average.months>0&&<small className={styles.muted}>Includes months with no payments. This month is excluded.</small>}</article>
   <article className="executive-card"><span className={styles.label}>Average Revenue per Customer</span><strong className={styles.amount}>{detailsAvailable&&customerMetrics.averageCents!=null?formatCents(Math.round(customerMetrics.averageCents)):"—"}</strong>
    <p className={styles.muted}>{!detailsAvailable?"Customer metrics are temporarily unavailable.":customerMetrics.unidentifiedCents?"Some payments have no customer information, so an accurate average is unavailable.":customerMetrics.customerCount?`Across ${customerMetrics.customerCount.toLocaleString("en-US")} unique paying customer${customerMetrics.customerCount===1?"":"s"}.`:"No paying customers in this period."}</p>
    {detailsAvailable&&customerMetrics.averageCents!=null&&<><Comparison current={customerMetrics.averageCents} prior={previousAvailable&&!previousCustomers.unidentifiedCents?previousCustomers.averageCents??0:null} label={previousLabel}/><Comparison current={customerMetrics.averageCents} prior={lastYearAvailable&&!lastYearCustomers.unidentifiedCents?lastYearCustomers.averageCents??0:null} label="vs the same period last year"/></>}
   </article>
  </div>
  <article className={`executive-card ${styles.trend}`}><div className="section-heading compact"><div><h3>Revenue Trend</h3><p>{grouping==="month"?"Monthly":grouping==="week"?"Weekly":"Daily"} collected revenue · {dateLabel(trendRange.start)} – {dateLabel(trendRange.end)}</p></div><nav aria-label="Revenue trend period" className={styles.windows}>{[6,12,24].map(months=><Link key={months} href={trendLink(String(months))} aria-current={trendWindow===months?"true":undefined}>{months}M</Link>)}{period==="custom"&&<Link href={trendLink("range")} aria-current={!trendWindow?"true":undefined}>Selected range</Link>}</nav></div>
   {!points.some(point=>point.cents>0)&&<p className={styles.muted}>No collected revenue in this range yet.</p>}
   <Trend points={points} description={`${grouping} revenue from ${dateLabel(trendRange.start)} through ${dateLabel(trendRange.end)}`}/>
   {points.some(point=>point.partial)&&<p className={styles.muted}>The last point shows revenue so far; that period is still in progress.</p>}
  </article>
  <article className={`executive-card ${styles.categories}`} aria-labelledby="sales-categories-heading"><h3 id="sales-categories-heading">Revenue by Category</h3><p className={styles.muted}>{dateLabel(range.start)} – {dateLabel(range.end)}</p>
   {!detailsAvailable?<p role="status">Category revenue is temporarily unavailable.</p>:!customerMetrics.categories.length?<p className={styles.muted}>No collected revenue in this period yet.</p>:<ul className={styles.categoryList}>{customerMetrics.categories.map(row=><li key={row.category}><div className={styles.categoryLabel}><span>{row.category}</span><span><strong>{formatCents(row.cents)}</strong> · {row.percent.toLocaleString("en-US",{maximumFractionDigits:1})}%</span></div><div className={styles.categoryTrack} aria-hidden="true"><div style={{width:`${row.percent}%`}}/></div></li>)}</ul>}
   <p className={styles.note}>Payments and refunds are allocated proportionally across discounted items, delivery/fees, and tax. Booking-level discounts are spread across rental items. Categories use your current inventory and service labels; missing item details appear as Uncategorized.</p>
  </article>
  <p className={styles.note}>Revenue includes deposits and invoice payments, including delivery and tax, before payment-processing fees. Recorded refunds reduce the original payment period.</p>
 </section>;
}
