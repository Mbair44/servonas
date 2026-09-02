import type {BookingFunnelEvent} from "./bookingFunnel.ts";

export const marketingSources=["google","google_ads","facebook","instagram","direct","organic","referral","email","unknown"] as const;
export type MarketingSource=(typeof marketingSources)[number];

export const commonFunnelStages=["visitor","engaged","conversion_started","lead_or_booking","customer","revenue"] as const;
export type CommonFunnelStage=(typeof commonFunnelStages)[number];

export const marketingInsightThresholds={
 insufficientVisits:25,
 directionalVisits:50,
 lowEngagementRate:0.2,
 lowConversionStartRate:0.2,
 weakLeadRateFromConversion:0.3,
 weakCheckoutCompletionRate:0.4,
 strongRoas:4,
} as const;

export type AttributionSessionLike={
 utm_source?:string|null;
 utm_medium?:string|null;
 utm_campaign?:string|null;
 utm_content?:string|null;
 utm_term?:string|null;
 first_referrer?:string|null;
 first_landing_url?:string|null;
 first_landing_path?:string|null;
 gclid?:string|null;
 gbraid?:string|null;
 wbraid?:string|null;
 fbclid?:string|null;
};

export type FunnelEventRow={
 attribution_session_id?:string|null;
 event_name:BookingFunnelEvent|string;
 occurred_at?:string|null;
 booking_id?:string|null;
 customer_id?:string|null;
 inventory_item_id?:string|null;
 service_id?:string|null;
 invoice_id?:string|null;
 booking_total_cents?:number|null;
 amount_paid_cents?:number|null;
 currency?:string|null;
 metadata?:Record<string,unknown>|null;
 booking_attribution_sessions?:AttributionSessionLike|AttributionSessionLike[]|null;
};

export type AttributedBookingRow={
 booking_id:string;
 status:string|null;
 total_cents:number|null;
 booking_attribution_snapshots?:AttributionSessionLike|AttributionSessionLike[]|null;
};

export type MarketingSourceSummary={
 source:MarketingSource;
 visits:number;
 engaged:number;
 conversionStarted:number;
 leadsOrBookings:number;
 bookings:number;
 customers:number;
 revenueCents:number;
 spendCents:number|null;
 roas:number|null;
 detailedCounts:Record<string,number>;
 stepCounts:Array<{key:string;label:string;count:number;progressFromPrevious:number|null;dropOffRate:number|null;}>;
 sessionMetrics:{
  sessionCount:number;
  avgSessionDurationSeconds:number|null;
  medianSessionDurationSeconds:number|null;
  avgEngagedDurationSeconds:number|null;
  medianEngagedDurationSeconds:number|null;
  bounceSessions:number;
  singlePageSessions:number;
 };
 insight:string;
 sampleStrength:"insufficient"|"directional"|"strong";
};

export type AttributionSessionMetricsRow=AttributionSessionLike&{
 id:string;
 total_session_duration_seconds?:number|null;
 engaged_duration_seconds?:number|null;
 page_count?:number|null;
 engaged_page_count?:number|null;
};

export type SessionDurationBucket={key:"under_1_second"|"one_to_four_seconds"|"five_to_nine_seconds"|"ten_or_more_seconds";label:string;count:number;};

const canonicalEventMap:Record<string,BookingFunnelEvent|"booking_start"|"item_added">={
 landing_page_view:"landing_view",
 landing_view:"landing_view",
 service_view:"service_view",
 inventory_view:"inventory_view",
 inventory_item_view:"inventory_view",
 rental_viewed:"inventory_view",
 booking_cta_click:"booking_start",
 inventory_item_clicked:"booking_start",
 check_availability_clicked:"booking_start",
 reserve_clicked:"booking_start",
 availability_check_started:"availability_check",
 availability_check:"availability_check",
 rental_availability_checked:"availability_check",
 date_selected:"date_selected",
 availability_date_selected:"date_selected",
 event_date_selected:"date_selected",
 event_date_changed:"date_selected",
 booking_started:"booking_start",
 item_added_to_cart:"item_added",
 checkout_started:"checkout_started",
 lead_submitted:"lead_submitted",
 customer_info_entered:"lead_submitted",
 booking_completed:"booking_completed",
 payment_completed:"payment_completed",
};

const detailedStepOrder=[
 {key:"landing_view",label:"Visits"},
 {key:"engaged",label:"Product / Service Views"},
 {key:"booking_start",label:"Booking Starts"},
 {key:"availability_check",label:"Availability Checks"},
 {key:"date_selected",label:"Dates Selected"},
 {key:"item_added",label:"Items Added"},
 {key:"checkout_started",label:"Checkout Started"},
 {key:"lead_submitted",label:"Leads"},
 {key:"booking_completed",label:"Bookings"},
] as const;

function clean(value:string|null|undefined){
 return value?.trim().toLowerCase()||"";
}

function referrerHost(value:string|null|undefined){
 if(!value)return "";
 try{return new URL(value).hostname.toLowerCase();}catch{return "";}
}

export function normalizeMarketingSource(session:AttributionSessionLike|null|undefined):MarketingSource{
 const utmSource=clean(session?.utm_source);
 const utmMedium=clean(session?.utm_medium);
 const host=referrerHost(session?.first_referrer);
 if(clean(session?.gclid)||clean(session?.gbraid)||clean(session?.wbraid))return "google_ads";
 if(utmSource==="google"&&/(cpc|ppc|paid|display|search)/.test(utmMedium))return "google_ads";
 if(utmSource==="google")return "google";
 if(clean(session?.fbclid))return utmSource==="instagram"||/instagram\./.test(host)?"instagram":"facebook";
 if(utmSource==="fb"||utmSource==="facebook"||utmSource==="meta")return "facebook";
 if(utmSource==="instagram")return "instagram";
 if(utmSource==="email"||utmMedium==="email")return "email";
 if(utmMedium==="organic")return "organic";
 if(utmMedium==="referral")return "referral";
 if(!utmSource&&/(google|bing|yahoo)\./.test(host))return "organic";
 if(!utmSource&&/(facebook|meta)\./.test(host))return "facebook";
 if(!utmSource&&/instagram\./.test(host))return "instagram";
 if(!utmSource&&host)return "referral";
 if(!utmSource&&!host)return "direct";
 return marketingSources.includes(utmSource as MarketingSource)?utmSource as MarketingSource:"unknown";
}

function canonicalEventName(value:string):string{
 return canonicalEventMap[value]??value;
}

function percent(numerator:number,denominator:number){
 return denominator>0?numerator/denominator:null;
}

function sampleStrength(visits:number):"insufficient"|"directional"|"strong"{
 if(visits<marketingInsightThresholds.insufficientVisits)return "insufficient";
 if(visits<marketingInsightThresholds.directionalVisits)return "directional";
 return "strong";
}

export function buildMarketingInsight(summary:Pick<MarketingSourceSummary,"source"|"visits"|"engaged"|"conversionStarted"|"leadsOrBookings"|"revenueCents"|"spendCents"|"roas"|"stepCounts"|"sampleStrength">){
 if(summary.sampleStrength==="insufficient")return "Not enough traffic yet to make a reliable recommendation.";
 const engagedRate=percent(summary.engaged,summary.visits)??0;
 const conversionRate=percent(summary.conversionStarted,summary.engaged||summary.visits)??0;
 const leadRate=percent(summary.leadsOrBookings,summary.conversionStarted||summary.engaged||summary.visits)??0;
 const checkoutStep=summary.stepCounts.find((step)=>step.key==="checkout_started");
 const bookingStep=summary.stepCounts.find((step)=>step.key==="booking_completed");
 const checkoutToBooking=checkoutStep&&bookingStep?percent(bookingStep.count,checkoutStep.count)??0:0;
 if(summary.spendCents&&summary.spendCents>0&&summary.revenueCents>0&&summary.roas!=null&&summary.roas>=marketingInsightThresholds.strongRoas){
  return `${labelForSource(summary.source)} generated $${(summary.revenueCents/100).toFixed(2)} in revenue from $${(summary.spendCents/100).toFixed(2)} in ad spend. ROAS is ${summary.roas.toFixed(1)}x.`;
 }
 if(summary.visits>=marketingInsightThresholds.insufficientVisits&&engagedRate<marketingInsightThresholds.lowEngagementRate){
  return `${labelForSource(summary.source)} is sending visitors, but most are leaving before viewing a service or rental.`;
 }
 if(summary.engaged>=10&&conversionRate<marketingInsightThresholds.lowConversionStartRate){
  return "Visitors are browsing your offerings, but few are starting a booking. Consider making the primary booking button more prominent.";
 }
 if(summary.conversionStarted>=5&&leadRate<marketingInsightThresholds.weakLeadRateFromConversion){
  return "Visitors are starting to convert, but few become leads or bookings. Review friction in your forms and availability flow.";
 }
 if(checkoutStep&&checkoutStep.count>=5&&checkoutToBooking<marketingInsightThresholds.weakCheckoutCompletionRate){
  return "Customers are reaching checkout but not completing their booking. Review checkout friction, pricing, required fields, and payment setup.";
 }
 return summary.sampleStrength==="directional"?"Traffic is still directional. Watch for a larger sample before changing spend aggressively.":"The funnel is moving visitors through to bookings without a dominant drop-off.";
}

export function labelForSource(source:MarketingSource){
 return ({
  google:"Google",
  google_ads:"Google Ads",
  facebook:"Facebook",
  instagram:"Instagram",
  direct:"Direct",
  organic:"Organic",
  referral:"Referral",
  email:"Email",
  unknown:"Unknown",
 } as Record<MarketingSource,string>)[source];
}

export interface MarketingSpendProvider{
 getSpendBySource(input:{businessId:string;from:string;to:string}):Promise<Partial<Record<MarketingSource,number|null>>>;
}

function bookingCountsForAnalytics(status:string|null|undefined){
 return status==="confirmed"||status==="paid";
}

function average(values:number[]){
 if(!values.length)return null;
 return Math.round((values.reduce((sum,value)=>sum+value,0)/values.length)*10)/10;
}

function median(values:number[]){
 if(!values.length)return null;
 const sorted=[...values].sort((left,right)=>left-right),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]!:Math.round((((sorted[middle-1]??0)+(sorted[middle]??0))/2)*10)/10;
}

export function buildSessionDurationBuckets(sessions:AttributionSessionMetricsRow[]):SessionDurationBucket[]{
 const buckets:SessionDurationBucket[]=[
  {key:"under_1_second",label:"Under 1 second",count:0},
  {key:"one_to_four_seconds",label:"1-4 seconds",count:0},
  {key:"five_to_nine_seconds",label:"5-9 seconds",count:0},
  {key:"ten_or_more_seconds",label:"10+ seconds",count:0},
 ];
 for(const session of sessions){
  const seconds=Math.max(0,Number(session.total_session_duration_seconds??0));
  if(seconds<1)buckets[0]!.count+=1;
  else if(seconds<5)buckets[1]!.count+=1;
  else if(seconds<10)buckets[2]!.count+=1;
  else buckets[3]!.count+=1;
 }
 return buckets;
}

function distinctCount(sets:Array<Set<string>|undefined>){
 const identities=new Set<string>();
 for(const set of sets)for(const identity of set??[])identities.add(identity);
 return identities.size;
}

export function buildSourcePerformanceReport(events:FunnelEventRow[],bookings:AttributedBookingRow[]=[],spendBySource:Partial<Record<MarketingSource,number|null>>={}){
 const sourceBuckets=new Map<MarketingSource,{detailed:Map<string,Set<string>>;customer:Set<string>;booking:Set<string>;revenue:number;}>();
 for(const row of events){
  const session=Array.isArray(row.booking_attribution_sessions)?row.booking_attribution_sessions[0]:row.booking_attribution_sessions;
  const source=normalizeMarketingSource(session);
  const sessionId=row.attribution_session_id||`${source}:anonymous`;
  const bucket=sourceBuckets.get(source)??{detailed:new Map(),customer:new Set(),booking:new Set(),revenue:0};
  const canonical=canonicalEventName(String(row.event_name));
  const eventSet=bucket.detailed.get(canonical)??new Set<string>();
  eventSet.add(sessionId);
  bucket.detailed.set(canonical,eventSet);
  if(row.customer_id)bucket.customer.add(row.customer_id);
  sourceBuckets.set(source,bucket);
 }
 for(const row of bookings){
  if(!bookingCountsForAnalytics(row.status))continue;
  const session=Array.isArray(row.booking_attribution_snapshots)?row.booking_attribution_snapshots[0]:row.booking_attribution_snapshots;
  const source=normalizeMarketingSource(session);
  const bucket=sourceBuckets.get(source)??{detailed:new Map(),customer:new Set(),booking:new Set(),revenue:0};
  bucket.booking.add(row.booking_id);
  bucket.revenue+=Math.max(0,Number(row.total_cents??0));
  sourceBuckets.set(source,bucket);
 }

 const summaries=(marketingSources.map((source)=>{
  const bucket=sourceBuckets.get(source)??{detailed:new Map(),customer:new Set(),booking:new Set(),revenue:0};
  const detailedCounts=Object.fromEntries([...bucket.detailed.entries()].map(([key,value])=>[key,value.size])) as Record<string,number>;
  const visits=detailedCounts.landing_view??0;
  // Funnel stages describe people, not the number of telemetry signals a person generated.
  // A visitor who enters booking is engaged even if they arrive directly at the booking flow.
  const engaged=distinctCount([
   bucket.detailed.get("service_view"),
   bucket.detailed.get("inventory_view"),
   bucket.detailed.get("booking_start"),
   bucket.detailed.get("availability_check"),
   bucket.detailed.get("date_selected"),
   bucket.detailed.get("item_added"),
   bucket.detailed.get("checkout_started"),
   bucket.detailed.get("lead_submitted"),
  ]);
  const conversionStarted=distinctCount([
   bucket.detailed.get("booking_start"),
   bucket.detailed.get("availability_check"),
   bucket.detailed.get("date_selected"),
   bucket.detailed.get("item_added"),
   bucket.detailed.get("checkout_started"),
  ]);
  const bookings=bucket.booking.size;
  detailedCounts.booking_completed=bookings;
  const leadsOrBookings=(detailedCounts.lead_submitted??0)+bookings;
  const customers=bucket.customer.size||bookings||0;
  const spendCents=spendBySource[source]??null;
  const revenueCents=bucket.revenue;
  const roas=spendCents&&spendCents>0?revenueCents/spendCents:null;
  const stepCounts=detailedStepOrder.map((step,index)=>{
   const count=step.key==="engaged"?engaged:detailedCounts[step.key]??0;
   const previous=index>0?(detailedStepOrder[index-1]!.key==="engaged"?engaged:(detailedCounts[detailedStepOrder[index-1]!.key]??0)):0;
   const progressFromPrevious=index===0?null:percent(count,previous);
   const dropOffRate=index===0?null:(previous>0?Math.max(0,1-count/previous):null);
   return {key:step.key,label:step.label,count,progressFromPrevious,dropOffRate};
  });
  const summary:MarketingSourceSummary={source,visits,engaged,conversionStarted,leadsOrBookings,bookings,customers,revenueCents,spendCents,roas,detailedCounts,stepCounts,sessionMetrics:{sessionCount:visits,avgSessionDurationSeconds:null,medianSessionDurationSeconds:null,avgEngagedDurationSeconds:null,medianEngagedDurationSeconds:null,bounceSessions:0,singlePageSessions:0},insight:"",sampleStrength:sampleStrength(visits)};
  summary.insight=buildMarketingInsight(summary);
  return summary;
 }).filter((item)=>item.visits||item.engaged||item.leadsOrBookings||item.revenueCents||item.spendCents!=null));

 const totals=summaries.reduce((acc,row)=>{
  acc.visits+=row.visits;
  acc.engaged+=row.engaged;
  acc.leadsOrBookings+=row.leadsOrBookings;
  acc.revenueCents+=row.revenueCents;
  if(row.spendCents!=null)acc.spendCents+=row.spendCents;
  return acc;
 },{visits:0,engaged:0,leadsOrBookings:0,revenueCents:0,spendCents:0});

 return {
  summaries,
  totals:{
   ...totals,
   roas:totals.spendCents>0?totals.revenueCents/totals.spendCents:null,
 },
 };
}

export function attachSessionMetricsToSourceReport(report:ReturnType<typeof buildSourcePerformanceReport>,sessions:AttributionSessionMetricsRow[]){
 const bySource=new Map<MarketingSource,AttributionSessionMetricsRow[]>();
 for(const session of sessions){
  const source=normalizeMarketingSource(session);
  const bucket=bySource.get(source)??[];
  bucket.push(session);
  bySource.set(source,bucket);
 }
 for(const summary of report.summaries){
  const bucket=bySource.get(summary.source)??[];
  const durationValues=bucket.map((row)=>Math.max(0,Number(row.total_session_duration_seconds??0))).filter((value)=>value>0);
  const engagedValues=bucket.map((row)=>Math.max(0,Number(row.engaged_duration_seconds??0))).filter((value)=>value>0);
  summary.sessionMetrics={
   sessionCount:bucket.length||summary.visits,
   avgSessionDurationSeconds:average(durationValues),
   medianSessionDurationSeconds:median(durationValues),
   avgEngagedDurationSeconds:average(engagedValues),
   medianEngagedDurationSeconds:median(engagedValues),
   bounceSessions:bucket.filter((row)=>Math.max(0,Number(row.engaged_page_count??0))===0).length,
   singlePageSessions:bucket.filter((row)=>Math.max(0,Number(row.page_count??0))<=1).length,
  };
 }
 return report;
}
