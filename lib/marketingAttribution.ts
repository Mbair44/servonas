import type {BookingFunnelEvent} from "./bookingFunnel.ts";

export const marketingSources=["google","google_ads","google_business_profile","meta_ads","organic_social","meta_unspecified","direct","organic","referral","email","unknown"] as const;
export type MarketingSource=(typeof marketingSources)[number];
export const organicProviders=["google","bing","duckduckgo","yahoo","other"] as const;
export type OrganicProvider=(typeof organicProviders)[number];

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
 utm_id?:string|null;
};

export type FunnelEventRow={
 attribution_session_id?:string|null;
 event_key?:string|null;
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
 last_path?:string|null;
 browser?:string|null;
 operating_system?:string|null;
 device_type?:string|null;
 first_interaction_type?:string|null;
 first_interaction_label?:string|null;
 first_interaction_identifier?:string|null;
 first_interaction_path?:string|null;
 first_interaction_at?:string|null;
 time_to_first_interaction_milliseconds?:number|null;
 meaningful_interaction_count?:number|null;
 automated_classification?:"human_likely"|"automated_likely"|"unknown"|null;
 automated_classification_reason?:string|null;
 total_session_duration_seconds?:number|null;
 engaged_duration_seconds?:number|null;
 total_session_duration_milliseconds?:number|null;
 engaged_duration_milliseconds?:number|null;
 duration_source?:"heartbeat"|"final_flush"|"inferred"|null;
 duration_final_flush_received?:boolean|null;
 page_count?:number|null;
 engaged_page_count?:number|null;
};

export type SessionDurationBucket={key:"timing_unavailable"|"under_1_second"|"one_to_four_seconds"|"five_to_nine_seconds"|"ten_or_more_seconds";label:string;count:number;};
export type SessionQualitySource="google_business_profile"|"meta_ads"|"organic_social"|"meta_unspecified"|"google_ads"|"organic_search"|"direct"|"referral"|"email"|"sms"|"unknown";
export type SessionEngagementClassification="engaged"|"quick_exit"|"neutral";
export type AutomatedTrafficClassification="human_likely"|"automated_likely"|"unknown";
export type SessionVerificationStatus="verified_activity"|"unverified_activity";
export type AttributionBreakdownEntry={label:string;count:number;};
export type SessionAttributionBreakdown={providerLabel:string;platformLabel:string|null;channelLabel:string|null;campaignName:string|null;campaignId:string|null;adSetName:string|null;adSetId:string|null;adName:string|null;adId:string|null;rawUtmSource:string|null;rawUtmMedium:string|null;rawUtmCampaign:string|null;rawUtmTerm:string|null;rawUtmContent:string|null;rawUtmId:string|null;fbclid:string|null;gclid:string|null;gbraid:string|null;wbraid:string|null;rawLandingUrl:string|null;};
export type MetaPerformanceNameRow={campaign_id:string|null;campaign_name:string|null;adset_id:string|null;adset_name:string|null;ad_id:string|null;ad_name:string|null;};
export type MetaAttributionName={name:string;rawId:string;level:"campaign"|"adset"|"ad";campaignName:string|null;campaignId:string|null;};
export type GoogleCampaignNameRow={google_campaign_id:string|number|null;campaign_name:string|null;};
export type CampaignPerformanceRow={source:MarketingSource|"meta_ads";name:string;rawId:string|null;isMetaId:boolean;resourceLevel:"campaign"|"adset"|"ad"|null;campaignName:string|null;campaignId:string|null;visits:number;itemViews:number;bookingStarts:number;bookings:number;revenueCents:number;};
export type SessionQualityDetail={id:string;startedAt:string|null;source:SessionQualitySource;campaignName:string|null;campaignId:string|null;sourceLabel:string;landingPage:string;device:string;browser:string;sessionLengthMs:number|null;verificationStatus:SessionVerificationStatus;timeToFirstInteractionMs:number|null;firstInteraction:string|null;firstInteractionLabel:string|null;pagesViewed:number;engagementClassification:SessionEngagementClassification;automatedClassification:AutomatedTrafficClassification;attribution:SessionAttributionBreakdown;metaAttributionName:MetaAttributionName|null;};
export type SessionQualityReport={includeAutomated:boolean;totalSessions:number;visibleSessions:number;verifiedSessions:number;unverifiedSessions:number;engagedSessions:number;quickExits:number;likelyAutomatedSessions:number;medianActiveSessionDurationMs:number|null;medianTimeToFirstInteractionMs:number|null;buckets:Array<SessionDurationBucket&{percentage:number;automatedCount:number;details:SessionQualityDetail[];sourceBreakdown:Array<{key:SessionQualitySource;label:string;count:number;percentage:number}>;landingPages:Array<{path:string;count:number}>;deviceBreakdown:Array<{label:string;count:number;percentage:number}>;campaignBreakdown:Array<{name:string;campaignId:string|null;isMetaId:boolean;source:string;count:number}>;verificationBreakdown:AttributionBreakdownEntry[];insight:string|null;observation:string|null;}>;landingPagePerformance:Array<{path:string;sessions:number;verifiedSessions:number;engaged:number;quickExits:number;avgActiveTimeMs:number|null;ctaInteractionRate:number;trafficSources:AttributionBreakdownEntry[];campaigns:AttributionBreakdownEntry[];devices:AttributionBreakdownEntry[];}>;primaryInsight:string|null;supportingObservation:string|null;};

export const defaultSessionEngagementThresholdMs=10_000;
const quickExitThresholdMs=5_000;
const qualityMeaningfulTypes=new Set(["button_click","link_click","booking_cta_click","phone_click","sms_click","email_click","form_start","form_submit","booking_started","product_service_selection","checkout_started","lead_submitted","payment_completed","reserve_clicked","item_added_to_cart"]);

const canonicalEventMap:Record<string,BookingFunnelEvent|"booking_start"|"item_added">={
 promotion_landing_view:"landing_view",
 promotion_primary_cta_clicked:"booking_start",
 booking_date_selection_started:"availability_check",
 booking_date_selected:"date_selected",
 promotion_inventory_viewed:"inventory_view",
 promotion_item_selected:"booking_start",
 promotion_no_inventory_available:"availability_check",
 initiate_checkout:"checkout_started",
 purchase:"payment_completed",
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

// Report-time evidence only: never write these classifications back to first touch.
const metaPaidMedia=new Set(["paid_social","paid","cpc","ppc"]);
const metaOrganicMedia=new Set(["social","organic","organic_social","social-organic"]);
function hasMetaOrigin(session:AttributionSessionLike|null|undefined){
 const host=referrerHost(session?.first_referrer);
 return ["fb","facebook","ig","instagram","meta"].includes(clean(session?.utm_source)) || Boolean(clean(session?.fbclid)) || /(^|\.)(facebook|instagram|meta)\.com$/.test(host);
}

export function normalizeMarketingSource(session:AttributionSessionLike|null|undefined,metaRows:MetaPerformanceNameRow[]=[]):MarketingSource{
 const utmSource=clean(session?.utm_source);
 const utmMedium=clean(session?.utm_medium);
 const host=referrerHost(session?.first_referrer);
 if(clean(session?.gclid)||clean(session?.gbraid)||clean(session?.wbraid))return "google_ads";
 if(utmSource==="google"&&/(cpc|ppc|paid|display|search)/.test(utmMedium))return "google_ads";
 if(clean(session?.utm_campaign)==="google_business_profile"||utmSource==="google_business_profile")return "google_business_profile";
 if(utmSource==="email"||utmMedium==="email")return "email";
 // Explicit non-Meta channels retain precedence over incidental social referrers/click IDs.
 const explicitMetaSource=["fb","facebook","ig","instagram","meta"].includes(utmSource);
 if(utmMedium==="organic"&&!explicitMetaSource)return "organic";
 if(utmMedium==="referral"&&!explicitMetaSource)return "referral";
 if(!utmSource&&/(google|bing|duckduckgo|yahoo)\./.test(host))return "organic";
 if(hasMetaOrigin(session)){
  if(metaPaidMedia.has(utmMedium)||(session&&resolveMetaAttributionName(session,metaRows)))return "meta_ads";
  if(metaOrganicMedia.has(utmMedium))return "organic_social";
  return "meta_unspecified";
 }
 if(!utmSource&&host)return "referral";
 if(!utmSource&&!host)return "direct";
 if(utmSource==="google")return "google";
 return "unknown";
}

function organicProviderFromValue(value:string){
 const normalized=value.replace(/^www\./,"").toLowerCase();
 if(normalized==="google"||/(^|\.)google\./.test(normalized))return "google" as const;
 if(normalized==="bing"||/(^|\.)bing\./.test(normalized))return "bing" as const;
 if(normalized==="duckduckgo"||/(^|\.)duckduckgo\./.test(normalized))return "duckduckgo" as const;
 if(normalized==="yahoo"||/(^|\.)yahoo\./.test(normalized))return "yahoo" as const;
 return "other" as const;
}

/** Derives a reporting-only search-engine provider from preserved first-touch data. */
export function organicProviderFor(session:AttributionSessionLike|null|undefined):OrganicProvider|null{
 if(normalizeMarketingSource(session)!=="organic")return null;
 const medium=clean(session?.utm_medium),source=clean(session?.utm_source);
 if(medium==="organic")return organicProviderFromValue(source);
 return organicProviderFromValue(referrerHost(session?.first_referrer));
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
  google:"Google (tagged)",
  google_ads:"Google Ads",
  google_business_profile:"Google Business Profile",
  meta_ads:"Meta Ads",
  organic_social:"Organic Social",
  meta_unspecified:"Meta — unspecified",
  direct:"Direct",
  organic:"Organic",
  referral:"Referral",
  email:"Email",
  unknown:"Unknown",
 } as Record<MarketingSource,string>)[source];
}

export function labelForOrganicProvider(provider:OrganicProvider){
 return ({google:"Google",bing:"Bing",duckduckgo:"DuckDuckGo",yahoo:"Yahoo",other:"Other / unknown organic"} as Record<OrganicProvider,string>)[provider];
}

export interface MarketingSpendProvider{
 getSpendBySource(input:{businessId:string;from:string;to:string}):Promise<Partial<Record<MarketingSource,number|null>>>;
}

function bookingCountsForAnalytics(status:string|null|undefined){
 return status==="confirmed"||status==="paid"||status==="scheduled"||status==="dispatched"||status==="en_route"||status==="arrived"||status==="in_progress"||status==="completed";
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
  {key:"timing_unavailable",label:"Timing unavailable",count:0},
  {key:"under_1_second",label:"Under 1 second",count:0},
  {key:"one_to_four_seconds",label:"1-4 seconds",count:0},
  {key:"five_to_nine_seconds",label:"5-9 seconds",count:0},
  {key:"ten_or_more_seconds",label:"10+ seconds",count:0},
 ];
 for(const session of sessions){
  const milliseconds=session.total_session_duration_milliseconds;
  if(milliseconds==null){buckets[0]!.count+=1;continue;}
  const seconds=Math.max(0,Number(milliseconds)/1000);
  if(seconds<1)buckets[1]!.count+=1;
  else if(seconds<5)buckets[2]!.count+=1;
  else if(seconds<10)buckets[3]!.count+=1;
  else buckets[4]!.count+=1;
 }
 return buckets;
}

function sourceLabelForQuality(source:SessionQualitySource){
 return ({meta_ads:"Meta Ads",organic_social:"Organic Social",meta_unspecified:"Meta — unspecified",google_ads:"Google Ads",
  google_business_profile:"Google Business Profile",organic_search:"Organic Search",direct:"Direct",referral:"Referral",email:"Email",sms:"SMS",unknown:"Unknown"} as Record<SessionQualitySource,string>)[source];
}

function cleanValue(value:string|null|undefined){
 return value?.trim()||"";
}

function sessionDurationMs(session:AttributionSessionMetricsRow){
 if(session.total_session_duration_milliseconds != null) return Math.max(0, Number(session.total_session_duration_milliseconds));
 if(session.total_session_duration_seconds != null && Number(session.total_session_duration_seconds) > 0) return Math.max(0, Number(session.total_session_duration_seconds) * 1000);
 return null;
}

function deviceLabel(session:AttributionSessionMetricsRow){
 const value=clean(session.device_type);
 if(value==="mobile")return "Mobile";
 if(value==="tablet")return "Tablet";
 if(value==="desktop")return "Desktop";
 return "Unknown";
}

function verifiedActivity(session:AttributionSessionMetricsRow){
 return session.total_session_duration_milliseconds != null
  || (session.total_session_duration_seconds != null && Number(session.total_session_duration_seconds) > 0)
  || session.duration_source === "heartbeat"
  || session.duration_source === "final_flush"
  || Boolean(session.duration_final_flush_received);
}

export function verificationStatusForSession(session:AttributionSessionMetricsRow):SessionVerificationStatus{
 return verifiedActivity(session) ? "verified_activity" : "unverified_activity";
}

function normalizePathname(value:string){
 const trimmed=value.trim();
 if(!trimmed)return "/";
 try{
  const parsed=trimmed.startsWith("http://") || trimmed.startsWith("https://") ? new URL(trimmed) : new URL(trimmed, "https://servonas.local");
  const pathname=parsed.pathname || "/";
  return pathname === "/" ? "/" : pathname.replace(/\/+$/,"") || "/";
 }catch{
  const fallback=trimmed.split("#")[0]!.split("?")[0]!;
  return fallback === "/" ? "/" : fallback.replace(/\/+$/,"") || "/";
 }
}

function cleanCampaignToken(value:string|null|undefined){
 return value?.trim() || null;
}

function splitMetaUtmTerm(value:string|null|undefined){
 const tokens=(value?.split("|") ?? []).map((token)=>token.trim()).filter(Boolean);
 return {adSetName:tokens[0] ?? null,adName:tokens[1] ?? null};
}

function splitMetaUtmContent(value:string|null|undefined){
 const tokens=(value?.split("|") ?? []).map((token)=>token.trim()).filter(Boolean);
 return {adSetId:tokens[0] ?? null,adId:tokens[1] ?? null};
}

function numericMetaId(value:string|null|undefined){
 const trimmed=cleanCampaignToken(value);
 return trimmed && /^\d{6,30}$/.test(trimmed) ? trimmed : null;
}

/** Resolves numeric Meta UTM identifiers from the tenant's already-synced reporting rows. */
export function resolveMetaAttributionName(session:AttributionSessionLike&{utm_id?:string|null},rows:MetaPerformanceNameRow[]):MetaAttributionName|null{
 if(!hasMetaOrigin(session))return null;
 const candidates:[string|null,"campaign"|"adset"|"ad"][]=[[numericMetaId(session.utm_campaign),"campaign"],[numericMetaId(session.utm_term),"adset"],[numericMetaId(session.utm_content),"ad"],[numericMetaId(session.utm_id),"campaign"]];
 const levels:[MetaAttributionName["level"],keyof MetaPerformanceNameRow,keyof MetaPerformanceNameRow][]=[
  ["campaign","campaign_id","campaign_name"],
  ["adset","adset_id","adset_name"],
  ["ad","ad_id","ad_name"],
 ];
 const find=(id:string,preferred?:MetaAttributionName["level"])=>{for(const [level,idField,nameField] of [...levels.filter(([level])=>level===preferred),...levels.filter(([level])=>level!==preferred)]){
   const row=rows.find((candidate)=>String(candidate[idField] ?? "").trim()===id);
   const name=row ? cleanCampaignToken(String(row[nameField] ?? "")) : null;
   if(name)return {name,rawId:id,level,campaignName:cleanCampaignToken(String(row?.campaign_name??"")),campaignId:cleanCampaignToken(String(row?.campaign_id??""))};
  }return null;};
 for(const [id,preferred] of candidates)if(id){const resolved=find(id,preferred);if(resolved)return resolved;}
 return null;
}

export function normalizeSessionAttribution(session:AttributionSessionLike&{utm_id?:string|null;first_landing_url?:string|null;},metaRows:MetaPerformanceNameRow[]=[]):SessionAttributionBreakdown{
 const utmSource=cleanValue(session.utm_source).toLowerCase();
 const utmMedium=cleanValue(session.utm_medium).toLowerCase();
 const referrer=referrerHost(session.first_referrer);
 const rawUtmSource=cleanCampaignToken(session.utm_source);
 const rawUtmMedium=cleanCampaignToken(session.utm_medium);
 const rawUtmCampaign=cleanCampaignToken(session.utm_campaign);
 const rawUtmTerm=cleanCampaignToken(session.utm_term);
 const rawUtmContent=cleanCampaignToken(session.utm_content);
 const rawUtmId=cleanCampaignToken((session as {utm_id?:string|null}).utm_id);
 const source=normalizeMarketingSource(session,metaRows);
 const sourceLooksMeta=["meta_ads","organic_social","meta_unspecified"].includes(source);
 const sourceLooksGoogle=Boolean(cleanValue(session.gclid) || cleanValue(session.gbraid) || cleanValue(session.wbraid)) || (utmSource==="google" && /(paid|cpc|ppc|search|display)/.test(utmMedium));
 if(sourceLooksMeta){
  const termParts=splitMetaUtmTerm(rawUtmTerm);
  const contentParts=splitMetaUtmContent(rawUtmContent);
  return {
   providerLabel:labelForSource(source),
   platformLabel:utmSource==="instagram" || utmSource==="ig" || /instagram/.test(referrer) ? "Instagram" : "Facebook",
   channelLabel:utmMedium==="paid" || utmMedium==="paid_social" ? "Paid Social" : rawUtmMedium,
   campaignName:rawUtmCampaign,
   campaignId:rawUtmId,
   adSetName:termParts.adSetName,
   adSetId:contentParts.adSetId,
   adName:termParts.adName,
   adId:contentParts.adId,
   rawUtmSource,
   rawUtmMedium,
   rawUtmCampaign,
   rawUtmTerm,
   rawUtmContent,
   rawUtmId,
   fbclid:cleanCampaignToken(session.fbclid),
   gclid:cleanCampaignToken(session.gclid),
   gbraid:cleanCampaignToken(session.gbraid),
   wbraid:cleanCampaignToken(session.wbraid),
   rawLandingUrl:cleanCampaignToken(session.first_landing_url),
  };
 }
 if(sourceLooksGoogle){
  return {
   providerLabel:"Google Ads",
   platformLabel:"Google",
   channelLabel:utmMedium==="paid" || utmMedium==="cpc" || utmMedium==="ppc" ? "Paid Search" : rawUtmMedium,
   campaignName:rawUtmCampaign,
   campaignId:rawUtmId,
   adSetName:null,
   adSetId:null,
   adName:rawUtmContent,
   adId:null,
   rawUtmSource,
   rawUtmMedium,
   rawUtmCampaign,
   rawUtmTerm,
   rawUtmContent,
   rawUtmId,
   fbclid:cleanCampaignToken(session.fbclid),
   gclid:cleanCampaignToken(session.gclid),
   gbraid:cleanCampaignToken(session.gbraid),
   wbraid:cleanCampaignToken(session.wbraid),
   rawLandingUrl:cleanCampaignToken(session.first_landing_url),
  };
 }
 return {
  providerLabel:sourceLabelForQuality(classifySessionQualitySource(session)),
  platformLabel:null,
  channelLabel:rawUtmMedium,
  campaignName:rawUtmCampaign,
  campaignId:rawUtmId,
  adSetName:null,
  adSetId:null,
  adName:rawUtmContent,
  adId:null,
  rawUtmSource,
  rawUtmMedium,
  rawUtmCampaign,
  rawUtmTerm,
  rawUtmContent,
  rawUtmId,
  fbclid:cleanCampaignToken(session.fbclid),
  gclid:cleanCampaignToken(session.gclid),
  gbraid:cleanCampaignToken(session.gbraid),
  wbraid:cleanCampaignToken(session.wbraid),
  rawLandingUrl:cleanCampaignToken(session.first_landing_url),
 };
}

export function classifySessionQualitySource(session:AttributionSessionLike,metaRows:MetaPerformanceNameRow[]=[]):SessionQualitySource{
 const source=normalizeMarketingSource(session,metaRows);
 if(source==="organic")return "organic_search";
 if(source==="unknown"&&(clean(session.utm_medium)==="sms"||["sms","text"].includes(clean(session.utm_source))))return "sms";
 return source==="google"?"unknown":source;
}

export function automatedTrafficClassification(session:AttributionSessionMetricsRow):AutomatedTrafficClassification{
 if(session.automated_classification==="automated_likely")return "automated_likely";
 if(session.automated_classification==="human_likely")return "human_likely";
 const browser=clean(session.browser);
 return browser? "human_likely":"unknown";
}

export function sessionEngagementClassification(session:AttributionSessionMetricsRow,engagementThresholdMs=defaultSessionEngagementThresholdMs):SessionEngagementClassification{
 const durationMs=sessionDurationMs(session) ?? 0;
 const pageCount=Math.max(0,Number(session.page_count ?? 0));
 const interactionCount=Math.max(0,Number(session.meaningful_interaction_count ?? 0));
 const firstInteractionType=cleanValue(session.first_interaction_type).toLowerCase();
 const hasMeaningfulInteraction=interactionCount>0 || qualityMeaningfulTypes.has(firstInteractionType);
 const automated=automatedTrafficClassification(session)==="automated_likely";
 const engaged=hasMeaningfulInteraction || pageCount>1 || durationMs>=engagementThresholdMs;
 if(engaged)return "engaged";
 if(!automated && durationMs>0 && durationMs<quickExitThresholdMs && pageCount<=1 && !hasMeaningfulInteraction)return "quick_exit";
 return "neutral";
}

function medianMs(values:number[]){
 if(!values.length)return null;
 const sorted=[...values].sort((left,right)=>left-right),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]!:Math.round((sorted[middle-1]!+sorted[middle]!)/2);
}

function bucketObservation(details:SessionQualityDetail[]){
 if(!details.length)return {insight:null,observation:null};
 const quickExits=details.filter((detail)=>detail.engagementClassification==="quick_exit");
 const mobileQuickExits=quickExits.filter((detail)=>detail.device==="Mobile");
 const automated=details.filter((detail)=>detail.automatedClassification==="automated_likely");
 const immediateCtas=details.filter((detail)=>detail.timeToFirstInteractionMs != null && detail.timeToFirstInteractionMs < 1000 && /booking_cta_click|phone_click|sms_click|email_click|button_click/i.test(detail.firstInteraction ?? ""));
 if(automated.length/details.length>=0.4)return {insight:"A significant share of these short sessions looks automated, so raw bounce numbers may overstate the problem.",observation:`Likely automated traffic: ${automated.length}`};
 if(immediateCtas.length && immediateCtas.length/details.length>=0.3)return {insight:"Many short sessions are actually taking action quickly, so low time on site is not always a problem here.",observation:`${immediateCtas.length} session${immediateCtas.length===1?"":"s"} clicked a CTA almost immediately.`};
 if(mobileQuickExits.length && mobileQuickExits.length>=Math.max(2,Math.ceil(quickExits.length*0.6)))return {insight:"Most quick exits in this bucket are on mobile. Review the first mobile screen and keep the main CTA above the fold.",observation:`${mobileQuickExits.length} of ${quickExits.length} quick exits came from mobile visitors.`};
 return {insight:null,observation:null};
}

export function buildSessionQualityReport(sessions:AttributionSessionMetricsRow[],input:{includeAutomated?:boolean;engagementThresholdMs?:number;metaPerformanceRows?:MetaPerformanceNameRow[]}={}):SessionQualityReport{
 const includeAutomated=input.includeAutomated ?? true;
 const engagementThresholdMs=input.engagementThresholdMs ?? defaultSessionEngagementThresholdMs;
 const details=sessions.map((session):SessionQualityDetail=>{
  const source=classifySessionQualitySource(session,input.metaPerformanceRows);
  const automatedClassification=automatedTrafficClassification(session);
  const campaignName=cleanValue(session.utm_campaign) || null;
  const campaignId=cleanValue(session.utm_content) || null;
  const attribution=normalizeSessionAttribution(session,input.metaPerformanceRows);
  return {
   id:session.id,
   startedAt:(session as {session_started_at?:string|null}).session_started_at ?? null,
   source,
   campaignName,
   campaignId,
   sourceLabel:sourceLabelForQuality(source),
   landingPage:normalizePathname(cleanValue(session.first_landing_path) || "/"),
   device:deviceLabel(session),
   browser:cleanValue(session.browser) || "Unknown",
   sessionLengthMs:sessionDurationMs(session),
   verificationStatus:verificationStatusForSession(session),
   timeToFirstInteractionMs:session.time_to_first_interaction_milliseconds == null ? null : Math.max(0, Number(session.time_to_first_interaction_milliseconds)),
   firstInteraction:cleanValue(session.first_interaction_type) || null,
   firstInteractionLabel:cleanValue(session.first_interaction_label) || null,
   pagesViewed:Math.max(0, Number(session.page_count ?? 0)),
   engagementClassification:sessionEngagementClassification(session,engagementThresholdMs),
   automatedClassification,
   attribution,
   metaAttributionName:resolveMetaAttributionName(session,input.metaPerformanceRows ?? []),
  };
 });
 const visibleDetails=includeAutomated?details:details.filter((detail)=>detail.automatedClassification!=="automated_likely");
 const buckets=buildSessionDurationBuckets(visibleDetails.map((detail)=>({id:detail.id,total_session_duration_milliseconds:detail.sessionLengthMs ?? null}))).map((bucket)=>({bucket,details:visibleDetails.filter((detail)=>bucket.key===(detail.sessionLengthMs==null?"timing_unavailable":detail.sessionLengthMs<1000?"under_1_second":detail.sessionLengthMs<5000?"one_to_four_seconds":detail.sessionLengthMs<10_000?"five_to_nine_seconds":"ten_or_more_seconds"))}));
 const bucketReports=buckets.map(({bucket,details:bucketDetails})=>{
  const sourceCounts=new Map<SessionQualitySource,number>();
  const landingCounts=new Map<string,number>();
  const deviceCounts=new Map<string,number>();
  const campaignCounts=new Map<string,{name:string;campaignId:string|null;isMetaId:boolean;source:string;count:number}>();
  const verificationCounts=new Map<string,number>();
  for(const detail of bucketDetails){
   sourceCounts.set(detail.source,(sourceCounts.get(detail.source) ?? 0)+1);
   landingCounts.set(detail.landingPage,(landingCounts.get(detail.landingPage) ?? 0)+1);
  deviceCounts.set(detail.device,(deviceCounts.get(detail.device) ?? 0)+1);
  if(detail.campaignName || detail.campaignId){
    const name=detail.metaAttributionName?.name ?? detail.campaignName ?? detail.campaignId ?? "Unknown campaign";
    const campaignId=detail.metaAttributionName?.rawId ?? detail.campaignId;
    const isMetaId=Boolean(detail.metaAttributionName || (detail.source==="meta_ads" && numericMetaId(detail.campaignName)));
    const sourceLabel=isMetaId ? "Meta Ads" : detail.sourceLabel;
    const key=`${name}:${campaignId ?? ""}:${sourceLabel}`;
    const current=campaignCounts.get(key) ?? {name,campaignId,isMetaId,source:sourceLabel,count:0};
    current.count+=1;
    campaignCounts.set(key,current);
   }
   verificationCounts.set(detail.verificationStatus,(verificationCounts.get(detail.verificationStatus) ?? 0)+1);
  }
  const suggestion=bucketObservation(bucketDetails);
  return {
   ...bucket,
   percentage:visibleDetails.length?bucket.count/visibleDetails.length:0,
   automatedCount:bucketDetails.filter((detail)=>detail.automatedClassification==="automated_likely").length,
   details:bucketDetails.sort((left,right)=>(right.startedAt ?? "").localeCompare(left.startedAt ?? "")),
   sourceBreakdown:[...sourceCounts.entries()].map(([key,count])=>({key,label:sourceLabelForQuality(key),count,percentage:bucketDetails.length?count/bucketDetails.length:0})).sort((left,right)=>right.count-left.count || left.label.localeCompare(right.label)),
   landingPages:[...landingCounts.entries()].map(([path,count])=>({path,count})).sort((left,right)=>right.count-left.count || left.path.localeCompare(right.path)).slice(0,6),
   deviceBreakdown:[...deviceCounts.entries()].map(([label,count])=>({label,count,percentage:bucketDetails.length?count/bucketDetails.length:0})).sort((left,right)=>right.count-left.count || left.label.localeCompare(right.label)),
   campaignBreakdown:[...campaignCounts.values()].sort((left,right)=>right.count-left.count || left.name.localeCompare(right.name)).slice(0,6),
   verificationBreakdown:[...verificationCounts.entries()].map(([label,count])=>({label:label==="verified_activity"?"Verified activity":"Unverified activity",count})).sort((left,right)=>right.count-left.count || left.label.localeCompare(right.label)),
   insight:suggestion.insight,
   observation:suggestion.observation,
  };
 });
 const activeDurations=visibleDetails.flatMap((detail)=>detail.sessionLengthMs == null ? [] : [detail.sessionLengthMs]);
 const firstInteractionTimes=visibleDetails.flatMap((detail)=>detail.timeToFirstInteractionMs == null ? [] : [detail.timeToFirstInteractionMs]);
 const landingPagePerformance=[...visibleDetails.reduce((map,detail)=>{
  const current=map.get(detail.landingPage) ?? {path:detail.landingPage,sessions:0,verifiedSessions:0,engaged:0,quickExits:0,totalDurationMs:0,durationCount:0,ctaCount:0,trafficSources:new Map<string,number>(),campaigns:new Map<string,number>(),devices:new Map<string,number>()};
  current.sessions+=1;
  if(detail.verificationStatus==="verified_activity")current.verifiedSessions+=1;
  if(detail.engagementClassification==="engaged")current.engaged+=1;
  if(detail.engagementClassification==="quick_exit")current.quickExits+=1;
  if(detail.sessionLengthMs != null){current.totalDurationMs+=detail.sessionLengthMs;current.durationCount+=1;}
  if(/booking_cta_click|phone_click|sms_click|email_click|button_click/i.test(detail.firstInteraction ?? ""))current.ctaCount+=1;
  current.trafficSources.set(detail.attribution.providerLabel,(current.trafficSources.get(detail.attribution.providerLabel) ?? 0)+1);
  const campaignName=detail.metaAttributionName?.name ?? detail.attribution.campaignName;
  if(campaignName)current.campaigns.set(campaignName,(current.campaigns.get(campaignName) ?? 0)+1);
  current.devices.set(detail.device,(current.devices.get(detail.device) ?? 0)+1);
  map.set(detail.landingPage,current);
  return map;
 },new Map<string,{path:string;sessions:number;verifiedSessions:number;engaged:number;quickExits:number;totalDurationMs:number;durationCount:number;ctaCount:number;trafficSources:Map<string,number>;campaigns:Map<string,number>;devices:Map<string,number>}>()).values()].map((row)=>({path:row.path,sessions:row.sessions,verifiedSessions:row.verifiedSessions,engaged:row.engaged,quickExits:row.quickExits,avgActiveTimeMs:row.durationCount?Math.round(row.totalDurationMs/row.durationCount):null,ctaInteractionRate:row.sessions?row.ctaCount/row.sessions:0,trafficSources:[...row.trafficSources.entries()].map(([label,count])=>({label,count})).sort((left,right)=>right.count-left.count || left.label.localeCompare(right.label)),campaigns:[...row.campaigns.entries()].map(([label,count])=>({label,count})).sort((left,right)=>right.count-left.count || left.label.localeCompare(right.label)),devices:[...row.devices.entries()].map(([label,count])=>({label,count})).sort((left,right)=>right.count-left.count || left.label.localeCompare(right.label))})).sort((left,right)=>right.sessions-left.sessions || left.path.localeCompare(right.path)).slice(0,8);
 const quickExitSessions=visibleDetails.filter((detail)=>detail.engagementClassification==="quick_exit");
 const automatedSessions=details.filter((detail)=>detail.automatedClassification==="automated_likely");
 let primaryInsight:string|null=null;
 let supportingObservation:string|null=null;
 if(visibleDetails.length && quickExitSessions.length/visibleDetails.length>=0.7 && visibleDetails.filter((detail)=>detail.sessionLengthMs != null && detail.sessionLengthMs < 1000 && detail.engagementClassification==="quick_exit").length/visibleDetails.length>=0.5){
  primaryInsight="A large share of visitors are leaving almost immediately. Review the first mobile screen, page speed, and whether the landing page matches the ad they clicked.";
 }else{
  const leadingCampaign=new Map<string,number>();
  for(const detail of quickExitSessions){
   const campaignName=detail.metaAttributionName?.name ?? detail.campaignName;
   if(!campaignName)continue;
   const key=`${campaignName}:${detail.sourceLabel}`;
   leadingCampaign.set(key,(leadingCampaign.get(key) ?? 0)+1);
  }
  const topCampaign=[...leadingCampaign.entries()].sort((left,right)=>right[1]-left[1])[0];
  if(topCampaign && topCampaign[1]>=Math.max(3,Math.ceil(quickExitSessions.length*0.5))){
   const [campaignName,sourceLabel]=topCampaign[0].split(":");
   primaryInsight=`Most quick exits are coming from your ${campaignName} ${sourceLabel} traffic. Consider sending those visitors to a more specific landing page instead of your general homepage.`;
  }else if(quickExitSessions.length && quickExitSessions.filter((detail)=>detail.device==="Mobile").length>=Math.max(3,Math.ceil(quickExitSessions.length*0.6))){
   primaryInsight="Most short sessions are on mobile. Review the first mobile screen and make sure your main CTA is visible without scrolling.";
  }
 }
 if(!primaryInsight && visibleDetails.filter((detail)=>detail.sessionLengthMs != null && detail.sessionLengthMs < 1000 && detail.engagementClassification==="engaged").length>=Math.max(2,Math.ceil(visibleDetails.length*0.2))){
  primaryInsight="Many short sessions are actually taking action quickly. Your time-on-site metric looks low, but these visitors are engaging.";
 }
 if(!primaryInsight && automatedSessions.length>=Math.max(3,Math.ceil(details.length*0.25))){
  primaryInsight="A significant portion of very short sessions appears to be automated traffic, so raw bounce numbers may overstate the problem.";
 }
 if(primaryInsight){
  const worstLanding=landingPagePerformance[0] && landingPagePerformance.slice().sort((left,right)=>right.quickExits-left.quickExits || right.sessions-left.sessions)[0];
  if(worstLanding)supportingObservation=`${worstLanding.path} had ${worstLanding.quickExits} quick exit${worstLanding.quickExits===1?"":"s"} from ${worstLanding.sessions} session${worstLanding.sessions===1?"":"s"}.`;
 }else if(landingPagePerformance[0]){
  supportingObservation=`${landingPagePerformance[0].path} generated the most visits in this report window.`;
 }
 return {
  includeAutomated,
  totalSessions:sessions.length,
  visibleSessions:visibleDetails.length,
  verifiedSessions:visibleDetails.filter((detail)=>detail.verificationStatus==="verified_activity").length,
  unverifiedSessions:visibleDetails.filter((detail)=>detail.verificationStatus==="unverified_activity").length,
  engagedSessions:visibleDetails.filter((detail)=>detail.engagementClassification==="engaged").length,
  quickExits:quickExitSessions.length,
  likelyAutomatedSessions:automatedSessions.length,
  medianActiveSessionDurationMs:medianMs(activeDurations),
  medianTimeToFirstInteractionMs:medianMs(firstInteractionTimes),
  buckets:bucketReports,
  landingPagePerformance,
  primaryInsight,
  supportingObservation,
 };
}

function distinctCount(sets:Array<Set<string>|undefined>){
 const identities=new Set<string>();
 for(const set of sets)for(const identity of set??[])identities.add(identity);
 return identities.size;
}

export type LandingPageFunnelRow={
 path:string;
 sessions:number;
 ctaClicks:number;
 ctaRate:number;
 bookingPageVisits:number;
 itemSelections:number;
 checkoutStarts:number;
 completedBookings:number;
 bookingConversionRate:number;
 revenueCents:number;
 revenuePerSessionCents:number;
 spendCents:number|null;
 cacCents:number|null;
 roas:number|null;
 checkoutSteps:Record<string,number>;
 deliveryFeeAnalysis:{zeroFeeSessions:number;paidFeeSessions:number;averagePaidFeeCents:number|null;zeroFeeTermsAcceptedRate:number|null;paidFeeTermsAcceptedRate:number|null}|null;
};

export type CheckoutFunnelSummary={
 checkoutStarts:number;
 completedBookings:number;
 observedBookingConfirmed:number;
 checkoutSteps:Record<string,number>;
};

const completedBookingStatuses=new Set(["confirmed","paid","scheduled","dispatched","en_route","arrived","in_progress","completed"]);
const landingPath=(value:string|null|undefined)=>normalizePathname(cleanValue(value)||"/");
const snapshotFor=(row:AttributedBookingRow)=>Array.isArray(row.booking_attribution_snapshots)?row.booking_attribution_snapshots[0]:row.booking_attribution_snapshots;
const eventSessionFor=(row:FunnelEventRow)=>Array.isArray(row.booking_attribution_sessions)?row.booking_attribution_sessions[0]:row.booking_attribution_sessions;

/** Groups existing first-touch sessions, funnel events, and authoritative bookings by landing page. */
export function buildLandingPageFunnelReport(input:{sessions:AttributionSessionMetricsRow[];events:FunnelEventRow[];bookings:AttributedBookingRow[];spendByCampaign?:Record<string,number|null|undefined>}):LandingPageFunnelRow[]{
 const checkoutEventNames=["checkout_started","checkout_addons_viewed","checkout_addons_skipped","checkout_addons_added","reservation_details_viewed","customer_info_completed","delivery_address_completed","delivery_quote_requested","delivery_fee_presented","delivery_quote_failed","delivery_address_ineligible","terms_accepted","payment_cta_clicked","payment_started","payment_succeeded","booking_confirmed"];
 const buckets=new Map<string,{sessions:Set<string>;ctaEvents:Set<string>;ctaSessions:Set<string>;bookingVisits:Set<string>;itemEvents:Set<string>;checkoutStarts:Set<string>;checkoutSteps:Map<string,Set<string>>;deliveryFees:Map<string,{feeCents:number;occurredAt:string}>;termsAccepted:Set<string>;bookings:Set<string>;revenue:number;campaigns:Set<string>}>();
 const bucket=(path:string)=>{const normalized=landingPath(path);let value=buckets.get(normalized);if(!value){value={sessions:new Set(),ctaEvents:new Set(),ctaSessions:new Set(),bookingVisits:new Set(),itemEvents:new Set(),checkoutStarts:new Set(),checkoutSteps:new Map(checkoutEventNames.map(name=>[name,new Set()])),deliveryFees:new Map(),termsAccepted:new Set(),bookings:new Set(),revenue:0,campaigns:new Set()};buckets.set(normalized,value);}return value;};
 const sessionPaths=new Map<string,string>();
 for(const session of input.sessions){const path=landingPath(session.first_landing_path);sessionPaths.set(session.id,path);const current=bucket(path);current.sessions.add(session.id);if(session.utm_campaign)current.campaigns.add(session.utm_campaign);}
 for(const event of input.events){
  const session=eventSessionFor(event);const sessionId=event.attribution_session_id??null;const path=landingPath(session?.first_landing_path??(sessionId?sessionPaths.get(sessionId):null));const current=bucket(path);const name=String(event.event_name);const canonical=canonicalEventName(name);const identity=event.event_key||`${sessionId??"anonymous"}:${name}:${event.booking_id??""}`;const funnelIdentity=sessionId||event.booking_id||identity;
  if(name==="booking_cta_click"||name==="promotion_primary_cta_clicked"){current.ctaEvents.add(identity);if(sessionId)current.ctaSessions.add(sessionId);}
  if(name==="booking_started"&&sessionId)current.bookingVisits.add(sessionId);
  if(["promotion_item_selected","inventory_item_clicked","item_added_to_cart","reserve_clicked"].includes(name))current.itemEvents.add(identity);
  // `initiate_checkout` is the legacy client-side name for the same checkout
  // start. Both views use the same first-touch session (or booking/event fallback).
  if(canonical==="checkout_started"){current.checkoutStarts.add(funnelIdentity);current.checkoutSteps.get("checkout_started")?.add(funnelIdentity);}
  else if(checkoutEventNames.includes(canonical))current.checkoutSteps.get(canonical)?.add(funnelIdentity);
  if(canonical==="terms_accepted")current.termsAccepted.add(funnelIdentity);
  if(canonical==="delivery_fee_presented"&&event.attribution_session_id){const fee=Math.max(0,Math.round(Number(event.metadata?.delivery_fee_cents??0)));const occurredAt=event.occurred_at??"";const previous=current.deliveryFees.get(event.attribution_session_id);if(!previous||occurredAt>=previous.occurredAt)current.deliveryFees.set(event.attribution_session_id,{feeCents:fee,occurredAt});}
 }
 for(const booking of input.bookings){
  if(!completedBookingStatuses.has(String(booking.status??"").toLowerCase()))continue;
  const snapshot=snapshotFor(booking);const current=bucket(landingPath(snapshot?.first_landing_path));
  if(current.bookings.has(booking.booking_id))continue;
  current.bookings.add(booking.booking_id);current.revenue+=Math.max(0,Number(booking.total_cents??0));if(snapshot?.utm_campaign)current.campaigns.add(snapshot.utm_campaign);
 }
 return [...buckets.entries()].map(([path,current])=>{
  const matchedCampaigns=[...current.campaigns];const spend=matchedCampaigns.length===1?input.spendByCampaign?.[matchedCampaigns[0]!.trim().toLowerCase()]??null:null;
  const completedBookings=current.bookings.size;
  const fees=[...current.deliveryFees.entries()],zeroFeeSessions=fees.filter(([,fee])=>fee.feeCents===0).map(([sessionId])=>sessionId),paidFees=fees.filter(([,fee])=>fee.feeCents>0),paidFeeSessions=paidFees.map(([sessionId])=>sessionId),termsRate=(sessionIds:string[])=>sessionIds.length?sessionIds.filter((id)=>current.termsAccepted.has(id)).length/sessionIds.length:null;
  return {path,sessions:current.sessions.size,ctaClicks:current.ctaEvents.size,ctaRate:current.sessions.size?current.ctaSessions.size/current.sessions.size:0,bookingPageVisits:current.bookingVisits.size,itemSelections:current.itemEvents.size,checkoutStarts:current.checkoutStarts.size,completedBookings,bookingConversionRate:current.sessions.size?completedBookings/current.sessions.size:0,revenueCents:current.revenue,revenuePerSessionCents:current.sessions.size?Math.round(current.revenue/current.sessions.size):0,spendCents:spend,cacCents:spend!=null&&completedBookings?Math.round(spend/completedBookings):null,roas:spend!=null&&spend>0?current.revenue/spend:null,checkoutSteps:Object.fromEntries(checkoutEventNames.map(name=>[name,current.checkoutSteps.get(name)?.size??0])),deliveryFeeAnalysis:fees.length?{zeroFeeSessions:zeroFeeSessions.length,paidFeeSessions:paidFeeSessions.length,averagePaidFeeCents:paidFees.length?Math.round(paidFees.reduce((sum,[,fee])=>sum+fee.feeCents,0)/paidFees.length):null,zeroFeeTermsAcceptedRate:termsRate(zeroFeeSessions),paidFeeTermsAcceptedRate:termsRate(paidFeeSessions)}:null};
 }).sort((a,b)=>b.sessions-a.sessions||a.path.localeCompare(b.path));
}

/** Sums already-deduplicated landing-page funnels without introducing a second event definition. */
export function summarizeCheckoutFunnels(rows:LandingPageFunnelRow[]):CheckoutFunnelSummary{
 const checkoutSteps:Record<string,number>={};
 let checkoutStarts=0,completedBookings=0;
 for(const row of rows){
  checkoutStarts+=row.checkoutStarts;
  completedBookings+=row.completedBookings;
  for(const [name,count] of Object.entries(row.checkoutSteps))checkoutSteps[name]=(checkoutSteps[name]??0)+count;
 }
 return {checkoutStarts,completedBookings,observedBookingConfirmed:checkoutSteps.booking_confirmed??0,checkoutSteps};
}

export type CheckoutFunnelSource="meta_ads"|MarketingSource;

/** Reuses the landing-page funnel for a first-touch source, using the same paid/organic evidence as source reporting. */
export function buildSourceCheckoutFunnelReport(input:{source:CheckoutFunnelSource;sessions:AttributionSessionMetricsRow[];events:FunnelEventRow[];bookings:AttributedBookingRow[];metaPerformanceRows?:MetaPerformanceNameRow[]}):CheckoutFunnelSummary{
 const matches=(session:AttributionSessionLike|null|undefined)=>normalizeMarketingSource(session,input.metaPerformanceRows)===input.source;
 const rows=buildLandingPageFunnelReport({
  sessions:input.sessions.filter(matches),
  events:input.events.filter(row=>matches(eventSessionFor(row))),
  bookings:input.bookings.filter(row=>matches(snapshotFor(row))),
 });
 return summarizeCheckoutFunnels(rows);
}

export function buildSourcePerformanceReport(events:FunnelEventRow[],bookings:AttributedBookingRow[]=[],spendBySource:Partial<Record<MarketingSource,number|null>>={},metaRows:MetaPerformanceNameRow[]=[]){
 const sourceBuckets=new Map<MarketingSource,{detailed:Map<string,Set<string>>;customer:Set<string>;booking:Set<string>;revenue:number;}>();
 for(const row of events){
  const session=Array.isArray(row.booking_attribution_sessions)?row.booking_attribution_sessions[0]:row.booking_attribution_sessions;
  const source=normalizeMarketingSource(session,metaRows);
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
  const source=normalizeMarketingSource(session,metaRows);
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

/** Reuses the canonical source report after narrowing organic traffic by its search engine. */
export function buildOrganicProviderPerformanceReport(events:FunnelEventRow[],bookings:AttributedBookingRow[]=[]){
 return organicProviders.flatMap((provider)=>{
  const providerEvents=events.filter((row)=>organicProviderFor(eventSessionFor(row))===provider);
  const providerBookings=bookings.filter((row)=>organicProviderFor(snapshotFor(row))===provider);
  const summary=buildSourcePerformanceReport(providerEvents,providerBookings,{}).summaries.find((row)=>row.source==="organic");
  return summary?[{provider,summary}]:[];
 });
}

export function attachSessionMetricsToSourceReport(report:ReturnType<typeof buildSourcePerformanceReport>,sessions:AttributionSessionMetricsRow[],metaRows:MetaPerformanceNameRow[]=[]){
 const bySource=new Map<MarketingSource,AttributionSessionMetricsRow[]>();
 for(const session of sessions){
  const source=normalizeMarketingSource(session,metaRows);
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

function campaignIdentity(session:AttributionSessionLike|undefined|null,metaRows:MetaPerformanceNameRow[],googleRows:GoogleCampaignNameRow[]){
 const source=normalizeMarketingSource(session,metaRows);
 const rawCampaign=["organic_social","meta_unspecified"].includes(source)?null:cleanCampaignToken(session?.utm_campaign);
 if(source==="meta_ads"){
  const resolved=session ? resolveMetaAttributionName(session,metaRows) : null;
  return {source,name:resolved?.name ?? rawCampaign ?? "Unattributed",rawId:resolved?.rawId ?? (numericMetaId(rawCampaign) ?? null),isMetaId:Boolean(resolved || numericMetaId(rawCampaign)),resourceLevel:resolved?.level ?? null,campaignName:resolved?.campaignName ?? null,campaignId:resolved?.campaignId ?? null};
 }
 if(source==="google_ads"){
  const matched=rawCampaign ? googleRows.find((row)=>String(row.google_campaign_id ?? "").trim()===rawCampaign && cleanCampaignToken(row.campaign_name)) : null;
  return {source,name:matched?.campaign_name?.trim() || rawCampaign || "Unattributed",rawId:matched ? String(matched.google_campaign_id) : null,isMetaId:false,resourceLevel:null,campaignName:null,campaignId:null};
 }
 return {source,name:rawCampaign ?? "Unattributed",rawId:null,isMetaId:false,resourceLevel:null,campaignName:null,campaignId:null};
}

/** Groups the same first-touch attribution used by source reporting into campaign rows. */
export function buildCampaignPerformanceReport(input:{sessions:AttributionSessionMetricsRow[];events:FunnelEventRow[];bookings:AttributedBookingRow[];metaPerformanceRows?:MetaPerformanceNameRow[];googleCampaignRows?:GoogleCampaignNameRow[]}):CampaignPerformanceRow[]{
 const metaRows=input.metaPerformanceRows ?? [],googleRows=input.googleCampaignRows ?? [];
 const rows=new Map<string,{source:MarketingSource|"meta_ads";name:string;rawId:string|null;isMetaId:boolean;resourceLevel:"campaign"|"adset"|"ad"|null;campaignName:string|null;campaignId:string|null;visits:Set<string>;itemViews:Set<string>;bookingStarts:Set<string>;bookings:Set<string>;revenueCents:number}>();
 const sessionAttribution=new Map<string,AttributionSessionLike>();
 const bucketFor=(session:AttributionSessionLike|undefined|null)=>{
  const identity=campaignIdentity(session,metaRows,googleRows),key=`${identity.source}:${identity.resourceLevel??"none"}:${identity.name}:${identity.rawId ?? ""}`;
  let bucket=rows.get(key);if(!bucket){bucket={...identity,visits:new Set(),itemViews:new Set(),bookingStarts:new Set(),bookings:new Set(),revenueCents:0};rows.set(key,bucket);}return bucket;
 };
 for(const session of input.sessions){sessionAttribution.set(session.id,session);bucketFor(session).visits.add(session.id);}
 for(const event of input.events){
  const session=eventSessionFor(event) ?? (event.attribution_session_id ? sessionAttribution.get(event.attribution_session_id) : null);
  const bucket=bucketFor(session),identity=event.attribution_session_id ?? event.event_key ?? `anonymous:${event.event_name}`;
  const canonical=canonicalEventName(String(event.event_name));
  if(["service_view","inventory_view","booking_start","availability_check","date_selected","item_added","checkout_started","lead_submitted"].includes(canonical))bucket.itemViews.add(identity);
  if(canonical==="booking_start")bucket.bookingStarts.add(identity);
 }
 for(const booking of input.bookings){
  if(!bookingCountsForAnalytics(booking.status))continue;
  const bucket=bucketFor(snapshotFor(booking));if(bucket.bookings.has(booking.booking_id))continue;
  bucket.bookings.add(booking.booking_id);bucket.revenueCents+=Math.max(0,Number(booking.total_cents ?? 0));
 }
 return [...rows.values()].map((row)=>({source:row.source,name:row.name,rawId:row.rawId,isMetaId:row.isMetaId,resourceLevel:row.resourceLevel,campaignName:row.campaignName,campaignId:row.campaignId,visits:row.visits.size,itemViews:row.itemViews.size,bookingStarts:row.bookingStarts.size,bookings:row.bookings.size,revenueCents:row.revenueCents})).filter((row)=>row.visits||row.itemViews||row.bookingStarts||row.bookings||row.revenueCents).sort((left,right)=>left.source.localeCompare(right.source)||String(left.campaignName??left.name).localeCompare(String(right.campaignName??right.name))||right.visits-left.visits||left.name.localeCompare(right.name));
}

export const googleBusinessProfileActions=["website","booking","other"] as const;
export type GoogleBusinessProfileAction=(typeof googleBusinessProfileActions)[number];

/** Only the explicit campaign convention establishes Website when content is absent. */
export function googleBusinessProfileActionFor(session:AttributionSessionLike|null|undefined):GoogleBusinessProfileAction|null{
 if(normalizeMarketingSource(session)!=="google_business_profile")return null;
 const content=clean(session?.utm_content);
 if(content==="booking")return "booking";
 if(content==="website"||(!content&&clean(session?.utm_campaign)==="google_business_profile"))return "website";
 return "other";
}

export function labelForGoogleBusinessProfileAction(action:GoogleBusinessProfileAction){
 return {website:"Website",booking:"Booking",other:"Other / unspecified"}[action];
}

/** Report-time partition of preserved attribution; uses the parent's metric definitions. */
export function buildGoogleBusinessProfileActionPerformanceReport(events:FunnelEventRow[],bookings:AttributedBookingRow[]=[]){
 return googleBusinessProfileActions.map((action)=>({
  action,
  summary:buildSourcePerformanceReport(
   events.filter((row)=>googleBusinessProfileActionFor(eventSessionFor(row))===action),
   bookings.filter((row)=>googleBusinessProfileActionFor(snapshotFor(row))===action),
  ).summaries.find((row)=>row.source==="google_business_profile")??null,
 }));
}
