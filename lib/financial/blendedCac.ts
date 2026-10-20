import {addDays} from "../bookingTime.ts";
import {revenueTrend,type SalesRange} from "./salesPerformance.ts";
export type CacDay={report_date:string;google_spend_cents:number;meta_spend_cents:number;new_customers:number;spend_available:boolean};
export type CacMetric={spendCents:number|null;customers:number;cacCents:number|null;available:boolean};
export function cacInRange(rows:CacDay[],range:SalesRange):CacMetric{
 const selected=rows.filter(row=>row.report_date>=range.start&&row.report_date<=range.end),available=selected.length>0&&selected.every(row=>row.spend_available);
 const spendCents=available?selected.reduce((sum,row)=>sum+Number(row.google_spend_cents)+Number(row.meta_spend_cents),0):null,customers=selected.reduce((sum,row)=>sum+Number(row.new_customers),0);
 return {available,spendCents,customers,cacCents:available&&customers>0?Math.round(spendCents!/customers):null};
}
export function cacDaily(rows:CacDay[]){return rows.map(row=>({date:row.report_date,cents:row.spend_available&&row.new_customers>0?Math.round((Number(row.google_spend_cents)+Number(row.meta_spend_cents))/Number(row.new_customers)):null,spendCents:row.spend_available?Number(row.google_spend_cents)+Number(row.meta_spend_cents):null,customers:Number(row.new_customers),available:row.spend_available}));}
export function coverageDays(from:string,to:string){const days:string[]=[];for(let date=from;date<=to;date=addDays(date,1))days.push(date);return days;}
export function cacTrend(rows:CacDay[],range:SalesRange,grouping:"day"|"week"|"month",today:string){
 const buckets=revenueTrend(rows.map(row=>({date:row.report_date,cents:0})),range,grouping,today);
 return buckets.map(bucket=>{const metric=cacInRange(rows,{start:bucket.date,end:bucket.end});return {...bucket,cents:metric.cacCents,spendCents:metric.spendCents,customers:metric.customers,available:metric.available};});
}
