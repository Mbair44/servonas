import Link from "next/link";
import type {SupabaseClient} from "@supabase/supabase-js";
import {formatCents} from "@/lib/financial/priceBook";
import {dateInTimeZone} from "@/lib/bookingTime";
import {bookingValueMetrics,customerCategoryMetrics,monthlyAverageComparisons,normalizeSalesReceipts,revenueChange,revenueInRange,revenueTrend,salesPerformanceOptions,type BookingValueDay,type SalesData,type SalesRange} from "@/lib/financial/salesPerformance";
import {SalesPerformanceFilters} from "./SalesPerformanceFilters";
import {SalesRevenueTrend} from "./SalesRevenueTrend";
import styles from "./SalesPerformance.module.css";
function Comparison({current,prior,label}:{current:number;prior:number|null;label:string}){
 const change=prior==null?null:revenueChange(current,prior),rounded=change==null?null:Math.round(change);
 return <p className={change!=null&&change>0?styles.increase:change!=null&&change<0?styles.decrease:styles.muted}>{prior==null?`Not enough history ${label}.`:rounded==null?`N/A ${label} (previous value was $0).`:`${rounded>0?"↑":rounded<0?"↓":"→"} ${Math.abs(rounded).toLocaleString("en-US")}% ${label}`}</p>;
}
function compactRangeLabel(range:SalesRange){
 const start=new Date(`${range.start}T12:00:00Z`),end=new Date(`${range.end}T12:00:00Z`),month=(value:Date)=>new Intl.DateTimeFormat("en-US",{month:"short",timeZone:"UTC"}).format(value),day=(value:Date)=>value.getUTCDate(),year=(value:Date)=>value.getUTCFullYear();
 if(range.start===range.end)return `${month(start)} ${day(start)}, ${year(start)}`;
 if(year(start)===year(end)&&month(start)===month(end))return `${month(start)} ${day(start)}–${day(end)}`;
 if(year(start)===year(end))return `${month(start)} ${day(start)} – ${month(end)} ${day(end)}`;
 return `${month(start)} ${day(start)}, ${year(start)} – ${month(end)} ${day(end)}, ${year(end)}`;
}
export async function SalesPerformance({db,businessId,businessSlug,today,query}:{db:SupabaseClient;businessId:string;businessSlug:string;today:string;query:Record<string,string|undefined>}){
 let options,rangeError:string|undefined;
 try{options=salesPerformanceOptions(query,today);}catch(error){rangeError=error instanceof Error?error.message:"Choose a valid date range.";options=salesPerformanceOptions({},today);}
 const {period,range,comparisons,trendWindow,trendRange,grouping,from}=options;
 const [{data,error},details,bookingValues,businessRecord,outstandingCurrent,outstandingPrevious,outstandingLastYear]=await Promise.all([
  db.rpc("sales_performance_summary",{p_business_id:businessId,p_from:from,p_through:today}),
  db.rpc("sales_performance_details",{p_business_id:businessId,p_from:from,p_through:today}),
  db.rpc("sales_performance_booking_values",{p_business_id:businessId,p_from:from,p_through:today}),
  db.from("businesses").select("created_at,timezone").eq("id",businessId).maybeSingle(),
  db.rpc("sales_performance_outstanding_as_of",{p_business_id:businessId,p_as_of:range.end}),
  db.rpc("sales_performance_outstanding_as_of",{p_business_id:businessId,p_as_of:comparisons.previous.end}),
  db.rpc("sales_performance_outstanding_as_of",{p_business_id:businessId,p_as_of:comparisons.lastYear.end})
 ]);
 const action=`/app/${businessSlug}`;
 if(error||!data){console.error("Sales performance unavailable",{businessId,code:error?.code,message:error?.message,details:error?.details,hint:error?.hint});return <section id="sales-performance" className={`executive-card ${styles.section}`} aria-labelledby="sales-heading"><h2 id="sales-heading">Sales Performance</h2><p role="status">Sales performance is temporarily unavailable. Your bookings and payments are unaffected.</p></section>;}
 const sales=data as SalesData,daily=sales.daily??[],revenue=revenueInRange(daily,range),operatingDate=businessRecord.data?.created_at?dateInTimeZone(new Date(businessRecord.data.created_at),businessRecord.data.timezone||"UTC"):sales.firstCollectedDate,average=monthlyAverageComparisons(daily,operatingDate,range.end),points=revenueTrend(daily,trendRange,grouping,today),bookedDaily=(bookingValues.data??[]).map((row:BookingValueDay)=>({date:row.booking_date,cents:Number(row.booking_value_cents)})),bookedPoints=revenueTrend(bookedDaily,trendRange,grouping,today);
 const receipts=normalizeSalesReceipts(details.data);
 const bookingMetrics=bookingValueMetrics((bookingValues.data??[]) as BookingValueDay[],range),previousBookings=bookingValueMetrics((bookingValues.data??[]) as BookingValueDay[],comparisons.previous),lastYearBookings=bookingValueMetrics((bookingValues.data??[]) as BookingValueDay[],comparisons.lastYear);
 const customerMetrics=customerCategoryMetrics(receipts,range),previousCustomers=customerCategoryMetrics(receipts,comparisons.previous),lastYearCustomers=customerCategoryMetrics(receipts,comparisons.lastYear);
 const detailsAvailable=!details.error&&details.data!=null&&customerMetrics.revenueCents===revenue;
 if(details.error)console.error("Sales performance details unavailable",{code:details.error.code,message:details.error.message,details:details.error.details,hint:details.error.hint,businessId});
 if(bookingValues.error)console.error("Sales performance booking values unavailable",{code:bookingValues.error.code,message:bookingValues.error.message,details:bookingValues.error.details,hint:bookingValues.error.hint,businessId});
 else if(details.data!=null&&customerMetrics.revenueCents!==revenue)console.error("Sales performance details do not reconcile",{businessId,summaryRevenueCents:revenue,detailRevenueCents:customerMetrics.revenueCents});
 const previousAvailable=previousCustomers.revenueCents===revenueInRange(daily,comparisons.previous);
 const lastYearAvailable=lastYearCustomers.revenueCents===revenueInRange(daily,comparisons.lastYear);
 const previousLabel=`vs ${compactRangeLabel(comparisons.previous)}`,lastYearLabel=`vs ${compactRangeLabel(comparisons.lastYear)}`;
 const trendLink=(value:string)=>{const params=new URLSearchParams({salesPeriod:period,salesTrend:value});if(period==="custom"){params.set("salesStart",range.start);params.set("salesEnd",range.end);}return `${action}?${params}#sales-performance`;};
 const dateLabel=(date:string)=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
 return <section id="sales-performance" className={styles.section} aria-labelledby="sales-heading">
  <div className="section-heading"><div><span>Your business at a glance</span><h2 id="sales-heading">Sales Performance</h2></div></div>
  <SalesPerformanceFilters key={`${period}:${range.start}:${range.end}`} period={period} range={range} today={today} action={action}/>
  {rangeError&&<p className="workspace-notice error" role="alert">{rangeError} Showing This Month.</p>}
  <p className={styles.period}>{dateLabel(range.start)} – {dateLabel(range.end)} · Dates follow your business time zone.</p>
  <div className={styles.metrics}>
   <article className="executive-card"><span className={styles.label}>Sales (Booked)</span><strong className={styles.amount}>{bookingValues.error?"—":formatCents(bookingMetrics.bookingValueCents)}</strong><p className={styles.muted}>{bookingMetrics.bookingCount.toLocaleString("en-US")} booking{bookingMetrics.bookingCount===1?"":"s"} created in this period, after discounts.</p>{!bookingValues.error&&<><Comparison current={bookingMetrics.bookingValueCents} prior={previousBookings.bookingValueCents} label={previousLabel}/><Comparison current={bookingMetrics.bookingValueCents} prior={lastYearBookings.bookingValueCents} label={lastYearLabel}/></>}</article>
   <article className="executive-card"><span className={styles.label}>Revenue</span><strong className={styles.amount}>{formatCents(revenue)}</strong><p className={styles.muted}>Money collected, less refunds</p><Comparison current={revenue} prior={revenueInRange(daily,comparisons.previous)} label={previousLabel}/><Comparison current={revenue} prior={revenueInRange(daily,comparisons.lastYear)} label={lastYearLabel}/></article>
   <article className="executive-card"><span className={styles.label}>Outstanding Revenue</span><strong className={styles.amount}>{outstandingCurrent.data==null?"—":formatCents(Number(outstandingCurrent.data))}</strong><p className={styles.muted}>{outstandingCurrent.data==null?"A reliable historical balance snapshot is unavailable for this date.":`Still owed as of ${dateLabel(range.end)} across active bookings and invoices. Each balance is counted once.`}</p>{outstandingCurrent.data!=null&&<><Comparison current={Number(outstandingCurrent.data)} prior={outstandingPrevious.data==null?null:Number(outstandingPrevious.data)} label={previousLabel}/><Comparison current={Number(outstandingCurrent.data)} prior={outstandingLastYear.data==null?null:Number(outstandingLastYear.data)} label={lastYearLabel}/></>}<Link href={`/app/${businessSlug}/invoices`}>View invoices →</Link><Link href={`/app/${businessSlug}/financials/reconciliation`}>Revenue reconciliation →</Link></article>
   <article className="executive-card"><span className={styles.label}>Average Monthly Revenue</span><strong className={styles.amount}>{average.current.cents==null?"—":formatCents(average.current.cents)}</strong><p className={styles.muted}>{average.current.months?`Based on ${average.current.months===12?"the last 12":average.current.months} completed month${average.current.months===1?"":"s"}.`:"Not enough completed operating history."}</p>{average.current.months>0&&<><small className={styles.muted}>Includes months with no payments. Incomplete months are excluded.</small><Comparison current={average.current.cents!} prior={average.previous.cents} label={average.previous.end?`vs rolling average ending ${dateLabel(average.previous.end)}`:"vs the prior rolling average"}/><Comparison current={average.current.cents!} prior={average.lastYear.cents} label={average.lastYear.end?`vs rolling average ending ${dateLabel(average.lastYear.end)}`:"vs the prior-year rolling average"}/></>}</article>
   <article className="executive-card"><span className={styles.label}>Average Revenue per Customer</span><strong className={styles.amount}>{detailsAvailable&&customerMetrics.averageCents!=null?formatCents(Math.round(customerMetrics.averageCents)):"—"}</strong>
    <p className={styles.muted}>{!detailsAvailable?"Customer metrics are temporarily unavailable.":customerMetrics.unidentifiedCents?"Some payments have no customer information, so an accurate average is unavailable.":customerMetrics.customerCount?`Across ${customerMetrics.customerCount.toLocaleString("en-US")} unique paying customer${customerMetrics.customerCount===1?"":"s"}.`:"No paying customers in this period."}</p>
    {detailsAvailable&&customerMetrics.averageCents!=null&&<><Comparison current={customerMetrics.averageCents} prior={previousAvailable&&!previousCustomers.unidentifiedCents?previousCustomers.averageCents??null:null} label={previousLabel}/><Comparison current={customerMetrics.averageCents} prior={lastYearAvailable&&!lastYearCustomers.unidentifiedCents?lastYearCustomers.averageCents??null:null} label={lastYearLabel}/></>}
   </article>
   <article className="executive-card"><span className={styles.label}>Average Booking Value</span><strong className={styles.amount}>{bookingValues.error||bookingMetrics.averageCents==null?"—":formatCents(Math.round(bookingMetrics.averageCents))}</strong>
    <p className={styles.muted}>{bookingValues.error?"Booking-value metrics are temporarily unavailable.":bookingMetrics.bookingCount?`Across ${bookingMetrics.bookingCount.toLocaleString("en-US")} booking${bookingMetrics.bookingCount===1?"":"s"}.`:"No qualifying bookings in this period."}</p>
    {!bookingValues.error&&bookingMetrics.averageCents!=null&&<><Comparison current={bookingMetrics.averageCents} prior={previousBookings.averageCents} label={previousLabel}/><Comparison current={bookingMetrics.averageCents} prior={lastYearBookings.averageCents} label={lastYearLabel}/><p className={bookingMetrics.averageCents<20000?styles.decrease:bookingMetrics.averageCents<22500?styles.muted:styles.increase}>Target: $225 · {bookingMetrics.averageCents<20000?"Below target":bookingMetrics.averageCents<22500?"Approaching target":"At/above target"}</p></>}
   </article>
  </div>
  <article className={`executive-card ${styles.trend}`}><div className="section-heading compact"><div><h3>Sales &amp; Revenue Trend</h3><p>{grouping==="month"?"Monthly":grouping==="week"?"Weekly":"Daily"} booked sales and collected revenue · {dateLabel(trendRange.start)} – {dateLabel(trendRange.end)}</p></div><nav aria-label="Sales and revenue trend period" className={styles.windows}>{[6,12,24].map(months=><Link key={months} href={trendLink(String(months))} aria-current={trendWindow===months?"true":undefined}>{months}M</Link>)}{period==="custom"&&<Link href={trendLink("range")} aria-current={!trendWindow?"true":undefined}>Selected range</Link>}</nav></div>
   <SalesRevenueTrend revenue={points} sales={bookedPoints} description={`${grouping} sales and revenue from ${dateLabel(trendRange.start)} through ${dateLabel(trendRange.end)}`}/>
   {points.some(point=>point.partial)&&<p className={styles.muted}>The last point is incomplete and shows activity so far.</p>}
  </article>
  <article className={`executive-card ${styles.categories}`} aria-labelledby="sales-categories-heading"><h3 id="sales-categories-heading">Revenue by Category</h3><p className={styles.muted}>{dateLabel(range.start)} – {dateLabel(range.end)}</p>
   {!detailsAvailable?<p role="status">Category revenue is temporarily unavailable.</p>:!customerMetrics.categories.length?<p className={styles.muted}>No collected revenue in this period yet.</p>:<ul className={styles.categoryList}>{customerMetrics.categories.map(row=><li key={row.category}><details className={styles.categoryDetails}><summary><div className={styles.categoryLabel}><span>{row.category}{row.items.length?" · View items":""}</span><span><strong>{formatCents(row.cents)}</strong> · {row.percent.toLocaleString("en-US",{maximumFractionDigits:1})}%</span></div><div className={styles.categoryTrack} aria-hidden="true"><div style={{width:`${row.percent}%`}}/></div></summary>{row.items.length>0&&<ul className={styles.itemList}>{row.items.map(item=><li key={item.item}><span>{item.item}</span><strong>{formatCents(item.cents)}</strong></li>)}</ul>}</details></li>)}</ul>}
   <p className={styles.note}>Click a category to view its items. Payments and refunds are allocated proportionally across discounted items, delivery/fees, and tax. Booking-level discounts are spread across rental items. Categories use your current inventory and service labels; missing item details appear as Uncategorized.</p>
  </article>
  <p className={styles.note}>Revenue includes deposits and invoice payments, including delivery and tax, before payment-processing fees. Recorded refunds reduce the original payment period.</p>
 </section>;
}
