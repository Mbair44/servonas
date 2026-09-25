import {addDays} from "../bookingTime.ts";
export type SalesPeriod="this_month"|"last_month"|"last_90_days"|"this_year"|"custom";
export type SalesRange={start:string;end:string};
export type RevenueDay={date:string;cents:number};
export type RevenuePoint={date:string;end:string;label:string;cents:number;partial:boolean};
export type SalesData={daily:RevenueDay[];firstCollectedDate:string|null;outstandingCents:number};
const dayMs=86400000;
export const daysInRange=(range:SalesRange)=>Math.round((Date.parse(range.end)-Date.parse(range.start))/dayMs)+1;
export const monthStart=(date:string)=>`${date.slice(0,7)}-01`;
export function shiftMonth(date:string,offset:number){
 const [year,month,day]=date.split("-").map(Number),target=new Date(Date.UTC(year,month-1+offset,1));
 const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 target.setUTCDate(Math.min(day,last));return target.toISOString().slice(0,10);
}
export function validSalesDate(value:string|undefined):value is string{
 return Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&value>="2000-01-01");
}
export function salesRange(period:SalesPeriod,today:string,start?:string,end?:string):SalesRange{
 if(period==="custom"){
  if(!validSalesDate(start)||!validSalesDate(end)||start>end||end>today||daysInRange({start,end})>3660)throw new Error("Choose a valid date range ending today or earlier, up to 10 years long.");
  return {start,end};
 }
 if(period==="last_month")return {start:shiftMonth(monthStart(today),-1),end:addDays(monthStart(today),-1)};
 if(period==="last_90_days")return {start:addDays(today,-89),end:today};
 return {start:period==="this_year"?`${today.slice(0,4)}-01-01`:monthStart(today),end:today};
}
export function comparisonRanges(range:SalesRange,period:SalesPeriod){
 const previous=period==="last_month"?{start:shiftMonth(range.start,-1),end:addDays(range.start,-1)}:period==="this_month"?{start:shiftMonth(range.start,-1),end:shiftMonth(range.end,-1)}:{start:addDays(range.start,-daysInRange(range)),end:addDays(range.start,-1)};
 return {previous,lastYear:{start:shiftMonth(range.start,-12),end:shiftMonth(range.end,-12)}};
}
export const revenueInRange=(daily:RevenueDay[],range:SalesRange)=>daily.reduce((sum,row)=>row.date>=range.start&&row.date<=range.end?sum+Number(row.cents):sum,0);
export function revenueChange(current:number,prior:number):number|null{return prior>0?((current-prior)/prior)*100:null;}
export function monthlyAverage(daily:RevenueDay[],firstDate:string|null,today:string){
 const lastMonth=shiftMonth(monthStart(today),-1),earliest=shiftMonth(monthStart(today),-12);
 if(!firstDate||monthStart(firstDate)>lastMonth)return {cents:null,months:0};
 const start=monthStart(firstDate)>earliest?monthStart(firstDate):earliest;
 const months=(Number(lastMonth.slice(0,4))-Number(start.slice(0,4)))*12+Number(lastMonth.slice(5,7))-Number(start.slice(5,7))+1;
 return {cents:Math.round(revenueInRange(daily,{start,end:addDays(monthStart(today),-1)})/months),months};
}
export function revenueTrend(daily:RevenueDay[],range:SalesRange,grouping:"day"|"week"|"month",today:string):RevenuePoint[]{
 const values=new Map(daily.map(row=>[row.date,Number(row.cents)])),points:RevenuePoint[]=[];
 for(let cursor=range.start;cursor<=range.end;){
  const next=grouping==="day"?addDays(cursor,1):grouping==="week"?addDays(cursor,7):shiftMonth(monthStart(cursor),1);
  const end=addDays(next,-1)>range.end?range.end:addDays(next,-1);
  let cents=0;for(let date=cursor;date<=end;date=addDays(date,1))cents+=values.get(date)??0;
  const label=new Intl.DateTimeFormat("en-US",{timeZone:"UTC",...(grouping==="month"?{month:"short" as const,year:"2-digit" as const}:{month:"short" as const,day:"numeric" as const})}).format(new Date(`${cursor}T12:00:00Z`));
  points.push({date:cursor,end,label:grouping==="week"?`Week of ${label}`:label,cents,partial:end===today&&grouping!=="day"&&addDays(next,-1)>today});cursor=next;
 }
 return points;
}
export function salesPerformanceOptions(query:Record<string,string|undefined>,today:string){
 const period:SalesPeriod=["this_month","last_month","last_90_days","this_year","custom"].includes(query.salesPeriod??"")?query.salesPeriod as SalesPeriod:"this_month";
 const range=salesRange(period,today,query.salesStart,query.salesEnd),comparisons=comparisonRanges(range,period);
 const trendWindow=["6","12","24"].includes(query.salesTrend??"")?Number(query.salesTrend):period==="custom"?0:12;
 const trendRange=trendWindow?{start:shiftMonth(monthStart(today),1-trendWindow),end:today}:range;
 const grouping=trendWindow?"month":daysInRange(range)<=45?"day":daysInRange(range)<=180?"week":"month";
 const from=[comparisons.previous.start,comparisons.lastYear.start,range.start,trendRange.start,shiftMonth(monthStart(today),-12)].sort()[0];
 return {period,range,comparisons,trendWindow,trendRange,grouping:grouping as "day"|"week"|"month",from};
}

export type CategoryWeight={category:string;cents:number};
export type SalesReceipt={date:string;cents:number;customerKey:string|null;weights:CategoryWeight[]};
export type BookingValueDay={booking_date:string;booking_value_cents:number;booking_count:number};
/** Allocate collected cents, never booked value. Largest remainders preserve every cent. */
export function allocateCategoryRevenue(cents:number,weights:CategoryWeight[]):CategoryWeight[]{
 if(cents<=0)return [];
 const merged=new Map<string,number>();
 for(const weight of weights){const value=Number(weight.cents);if(value>0&&Number.isFinite(value))merged.set(weight.category,(merged.get(weight.category)??0)+value);}
 if(!merged.size)return [{category:"Uncategorized",cents}];
 const total=Array.from(merged.values()).reduce((sum,value)=>sum+value,0);
 const shares=Array.from(merged,([category,weight])=>{const exact=cents*weight/total;return {category,cents:Math.floor(exact),remainder:exact-Math.floor(exact)};});
 shares.sort((a,b)=>b.remainder-a.remainder||a.category.localeCompare(b.category));
 const remainder=cents-shares.reduce((sum,share)=>sum+share.cents,0);
 for(let i=0;i<remainder;i++)shares[i%shares.length].cents++;
 return shares.map(({category,cents})=>({category,cents}));
}
export function customerCategoryMetrics(receipts:SalesReceipt[],range:SalesRange){
 const customers=new Set<string>(),categories=new Map<string,number>();let revenueCents=0,unidentifiedCents=0;
 for(const receipt of receipts){
  if(receipt.date<range.start||receipt.date>range.end||Number(receipt.cents)<=0)continue;
  const cents=Number(receipt.cents);revenueCents+=cents;
  if(receipt.customerKey)customers.add(receipt.customerKey);else unidentifiedCents+=cents;
  for(const share of allocateCategoryRevenue(cents,receipt.weights??[]))categories.set(share.category,(categories.get(share.category)??0)+share.cents);
 }
 return {revenueCents,customerCount:customers.size,unidentifiedCents,
  averageCents:customers.size&&!unidentifiedCents?revenueCents/customers.size:null,
  categories:Array.from(categories,([category,cents])=>({category,cents,percent:revenueCents?cents/revenueCents*100:0})).filter(row=>row.cents>0).sort((a,b)=>b.cents-a.cents||a.category.localeCompare(b.category))};
}
/** Average final stored booking total, independent of payment collection. */
export function bookingValueMetrics(days:BookingValueDay[],range:SalesRange){
 let bookingValueCents=0,bookingCount=0;
 for(const day of days){
  if(day.booking_date<range.start||day.booking_date>range.end)continue;
  bookingValueCents+=Math.max(0,Number(day.booking_value_cents)||0);
  bookingCount+=Math.max(0,Math.trunc(Number(day.booking_count)||0));
 }
 return {bookingValueCents,bookingCount,averageCents:bookingCount?bookingValueCents/bookingCount:null};
}
