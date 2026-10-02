import {NextResponse} from "next/server";
import {attributionKeys,bookingFunnelEvents,validSessionId,type AttributionValues,type BookingFunnelEvent} from "@/lib/bookingFunnel";
import {bookingFunnelEnabled} from "@/lib/optionalAnalytics";
import {normalizeMarketingSource} from "@/lib/marketingAttribution";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {unstable_cache} from "next/cache";

const bots=/bot|crawler|spider|facebookexternalhit|facebookcatalog|googleother|google-inspectiontool|apis-google|headless|lighthouse|playwright|puppeteer|preview|scanner|slurp|bingpreview/i;
const automationReferrers=/facebook\.com|l\.facebook\.com|lm\.facebook\.com|developers\.facebook\.com|googleweblight|webcache\.googleusercontent/i;
const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().slice(0,max):"";
const allowed=new Set<string>(bookingFunnelEvents.filter((event)=>event!=="booking_completed"&&event!=="payment_completed"));
const safeMetadata=(value:unknown)=>{if(!value||typeof value!=="object"||Array.isArray(value))return {};const out:Record<string,string|number|boolean|null>={};for(const [key,item] of Object.entries(value as Record<string,unknown>)){if(!/^[a-z][a-z0-9_]{0,60}$/i.test(key))continue;if(typeof item==="string")out[key]=clean(item,200);else if(typeof item==="number"&&Number.isFinite(item))out[key]=item;else if(typeof item==="boolean"||item===null)out[key]=item;}return out;};
const legacyClickConstraint=(error:{code?:string;message?:string;details?:string}|null)=>Boolean(error?.code==="23514"&&(error.message?.includes("booking_funnel_events_event_name_check")||error.details?.includes("booking_funnel_events_event_name_check")));
const diagnosticsEnabled=()=>process.env.BOOKING_FUNNEL_DIAGNOSTICS==="1";
const logStage=(message:string,details:Record<string,unknown>)=>{if(diagnosticsEnabled())console.info(message,details);};
const diagnosticResponse=(result:string)=>new NextResponse(null,{status:204,headers:diagnosticsEnabled()?{"x-servonas-funnel-result":result}:undefined});
const referrerHostname=(value:unknown)=>{try{return new URL(clean(value,2000)).hostname||null;}catch{return null;}};
const diagnosticRequest=(body:{sessionId?:string;event?:string;path?:string;referrer?:string;attribution?:AttributionValues;metadata?:object}|null,businessSlug:string,stage:string,extra:Record<string,unknown>={})=>{
 const attribution=body?.attribution??{},metadata=safeMetadata(body?.metadata);
 logStage("Booking funnel diagnostic",{stage,businessSlug,pathname:clean(body?.path,500)||null,event:body?.event??null,sessionPresent:Boolean(body?.sessionId),attributionPresent:Object.values(attribution).some(Boolean),utmSource:clean(attribution.utm_source,100)||null,utmMedium:clean(attribution.utm_medium,100)||null,utmCampaign:clean(attribution.utm_campaign,100)||null,referrerHostname:referrerHostname(body?.referrer),analyticsConsent:textValue(metadata.analytics_consent,20),...extra});
};
const pageType=(value:unknown)=>{const next=clean(value,40).toLowerCase();return next&&/^[a-z_]+$/.test(next)?next:null;};
const wholeNumber=(value:unknown,max=3600)=>{const next=Number(value);if(!Number.isFinite(next))return 0;return Math.max(0,Math.min(max,Math.round(next)));};
const nullableWholeNumber=(value:unknown,max=3_600_000)=>{if(value==null||value==="")return null;const next=Number(value);if(!Number.isFinite(next))return null;return Math.max(0,Math.min(max,Math.round(next)));};
const textValue=(value:unknown,max=80)=>{const next=clean(value,max);return next||null;};
const automationClassification=(input:{userAgent:string;purpose:string;referrer:string;event:string;metadata:Record<string,unknown>})=>{
 const userAgent=input.userAgent.toLowerCase();
 const purpose=input.purpose.toLowerCase();
 const referrer=input.referrer.toLowerCase();
 if(/prefetch|preview/.test(purpose))return {classification:"automated_likely" as const,reason:"prefetch_request"};
 if(bots.test(userAgent))return {classification:"automated_likely" as const,reason:"bot_user_agent"};
 if(automationReferrers.test(referrer)&&input.event==="landing_page_view")return {classification:"automated_likely" as const,reason:"preview_referrer"};
 if(String(input.metadata.fetch_mode ?? "").toLowerCase()==="navigate"&&String(input.metadata.fetch_dest ?? "").toLowerCase()==="document")return {classification:"unknown" as const,reason:null};
 return {classification:"unknown" as const,reason:null};
};
const meaningfulInteraction=(event:string,metadata:Record<string,unknown>)=>({
 occurred:new Set(["button_click","link_click","booking_cta_click","phone_click","sms_click","email_click","form_start","form_submit","booking_started","product_service_selection","checkout_started","lead_submitted","payment_completed","reserve_clicked","item_added_to_cart"]).has(event),
 type:textValue(metadata.interaction_type,40) ?? event,
 label:textValue(metadata.interaction_label,120),
 identifier:textValue(metadata.interaction_identifier,80),
 path:textValue(metadata.interaction_pathname,400) ?? textValue(metadata.path,400),
 milliseconds:nullableWholeNumber(metadata.interaction_since_session_start_milliseconds),
});
const sessionMetricUpdate=(metadata:Record<string,unknown>)=>{
 const milliseconds=nullableWholeNumber(metadata.active_duration_increment_milliseconds);
 const legacySeconds=wholeNumber(metadata.session_duration_increment_seconds);
 const incrementMilliseconds=milliseconds??(legacySeconds?legacySeconds*1000:null);
 const source=metadata.timing_event_type==="final_flush"?"final_flush":metadata.timing_event_type==="heartbeat"?"heartbeat":null;
 return {incrementMilliseconds,source,finalFlushReceived:metadata.timing_is_final===true,flushReason:textValue(metadata.timing_flush_reason,40)};
};
const eventKeyFor=(body:{sessionId:string;event:string;interactionId?:string;path?:string;inventoryItemId?:string;serviceId?:string;metadata?:object})=>{
 // A click ID is stable across request retries, but new for each intentional click.
 if(validSessionId(body.interactionId))return `${body.sessionId}:interaction:${body.interactionId}`;
 const metadata=safeMetadata(body.metadata);
 const parts=[body.sessionId,body.event];
 switch(body.event){
 case "landing_page_view":
 case "landing_view":
  return `${body.sessionId}:landing:${clean(body.path,1000)}`;
 case "inventory_item_view":
 case "inventory_view":
 case "service_view":
 case "inventory_item_clicked":
 case "booking_cta_click":
 case "check_availability_clicked":
 case "reserve_clicked":
 case "item_added_to_cart":
  parts.push(clean(body.inventoryItemId,100)||"none",clean(body.serviceId,100)||"none",String(metadata.date??""),String(metadata.source_flow??""),String(metadata.interaction_source??""));
  break;
 case "availability_check_started":
 case "availability_check":
  parts.push(clean(body.path,1000),String(metadata.source_flow??""));
  break;
 case "event_date_selected":
 case "event_date_changed":
 case "date_selected":
  parts.push(clean(body.inventoryItemId,100)||"none",clean(body.serviceId,100)||"none",String(metadata.date??""),String(metadata.range_end??""),String(metadata.source_flow??""));
  break;
 case "rental_availability_checked":
 case "rental_available":
 case "rental_unavailable":
 case "available_inventory_viewed":
  parts.push(clean(body.inventoryItemId,100)||"none",String(metadata.date??""),String(metadata.range_end??""),String(metadata.source_flow??""),String(metadata.available_count??""));
  break;
 case "booking_started":
 case "customer_info_entered":
 case "customer_info_completed":
 case "delivery_address_completed":
 case "delivery_quote_requested":
 case "delivery_quote_failed":
 case "delivery_address_ineligible":
 case "delivery_fee_presented":
 case "terms_accepted":
 case "payment_cta_clicked":
 case "payment_started":
 case "lead_submitted":
 case "checkout_started":
 case "checkout_addons_viewed":
 case "checkout_addons_skipped":
 case "checkout_addons_added":
 case "reservation_details_viewed":
  parts.push(clean(body.path,1000),clean(body.serviceId,100)||"none",String(metadata.date??""),String(metadata.source_flow??""),String(metadata.item_count??""),String(metadata.delivery_fee_cents??""),String(metadata.final_total_cents??""));
  break;
 default:
  return null;
 }
 return parts.join(":").slice(0,500);
};
const businessIdForBookingSlug=unstable_cache(async(businessSlug:string)=>{const db=getSupabaseAdmin();if(!db)return null;const {data:bookingSettings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();if(bookingSettings?.business_id)return bookingSettings.business_id;const {data:websiteSettings}=await db.from("business_website_settings").select("business_id").ilike("public_slug",businessSlug).eq("status","published").maybeSingle();if(websiteSettings?.business_id)return websiteSettings.business_id;const {data:business}=await db.from("businesses").select("id").ilike("slug",businessSlug).maybeSingle();return business?.id??null;},["booking-funnel-business-id"],{revalidate:300});

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 if(!bookingFunnelEnabled())return diagnosticResponse("funnel_disabled");
 const purpose=request.headers.get("purpose")||request.headers.get("x-middleware-prefetch")||"",ua=request.headers.get("user-agent")||"";
 const body=await request.json().catch(()=>null) as {sessionId?:string;interactionId?:string;event?:string;path?:string;pageType?:string;landingUrl?:string;referrer?:string;attribution?:AttributionValues;inventoryItemId?:string;serviceId?:string;metadata?:object;touchSession?:boolean;touchOnly?:boolean}|null;
 const {businessSlug}=await params;
 diagnosticRequest(body,businessSlug,"received");
 if(!body||!validSessionId(body.sessionId)||!body.event||!allowed.has(body.event)){diagnosticRequest(body,businessSlug,"rejected",{reason:"invalid_payload"});return NextResponse.json({error:"Invalid analytics event."},{status:400});}
 const sessionId=body.sessionId as string,event=body.event as string;
 const db=getSupabaseAdmin();if(!db){diagnosticRequest(body,businessSlug,"rejected",{reason:"admin_client_unavailable"});return diagnosticResponse("admin_client_unavailable");}
 const businessId=await businessIdForBookingSlug(businessSlug);
 if(!businessId){diagnosticRequest(body,businessSlug,"rejected",{reason:"business_slug_unresolved"});return diagnosticResponse("business_slug_unresolved");}
 const metadata=safeMetadata(body.metadata);
 const automation=automationClassification({userAgent:ua,purpose,referrer:clean(body.referrer,2000),event,metadata});
 const interaction=meaningfulInteraction(event,metadata);
 if(body.touchSession||body.touchOnly){
  const attribution=body.attribution??{},sessionPath=clean(body.path,1000)||null,sessionPageType=pageType(body.pageType),metricUpdate=sessionMetricUpdate(metadata);
  const pageIncrement=["promotion_landing_view","landing_page_view","landing_view"].includes(event)?1:0;
  const engagedIncrement=["service_view","inventory_view","inventory_item_view","rental_viewed","available_inventory_viewed"].includes(event)?1:0;
  const sessionPatch:Record<string,unknown>={first_landing_url:clean(body.landingUrl,2000)||null,first_landing_path:sessionPath,first_referrer:clean(body.referrer,2000)||null,last_path:sessionPath,last_page_type:sessionPageType,entry_page_type:sessionPageType,duration_increment_milliseconds:metricUpdate.incrementMilliseconds,duration_source:metricUpdate.source,duration_final_flush_received:metricUpdate.finalFlushReceived,duration_last_flush_reason:metricUpdate.flushReason,page_increment:pageIncrement,engaged_page_increment:engagedIncrement,browser:textValue(metadata.browser),operating_system:textValue(metadata.operating_system),device_type:textValue(metadata.device_type),first_interaction_type:interaction.occurred?interaction.type:null,first_interaction_label:interaction.occurred?interaction.label:null,first_interaction_identifier:interaction.occurred?interaction.identifier:null,first_interaction_path:interaction.occurred?interaction.path:null,time_to_first_interaction_milliseconds:interaction.occurred?interaction.milliseconds:null,meaningful_interaction_increment:interaction.occurred?1:0,automated_classification:automation.classification,automated_classification_reason:automation.reason};
  for(const key of attributionKeys)sessionPatch[key]=clean(attribution[key],500)||null;
  const {error:sessionError}=await db.rpc("upsert_booking_attribution_session",{p_business_id:businessId,p_session_id:sessionId,p_patch:sessionPatch});
  if(sessionError){console.error("Booking attribution session save failed",{stage:"session_upsert",businessId,businessSlug,sessionId,event,code:sessionError.code,message:sessionError.message,details:sessionError.details,hint:sessionError.hint});diagnosticRequest(body,businessSlug,"rejected",{reason:"session_upsert_failed"});return diagnosticResponse("session_upsert_failed");}
  logStage("Booking funnel session upsert completed",{stage:"session_upsert",businessId,businessSlug,sessionId,event,source:normalizeMarketingSource(attribution),hasGclid:Boolean(attribution.gclid||attribution.gbraid||attribution.wbraid),hasFbclid:Boolean(attribution.fbclid),touchSession:Boolean(body.touchSession),touchOnly:Boolean(body.touchOnly),pageType:sessionPageType,activeMilliseconds:metricUpdate.incrementMilliseconds,durationSource:metricUpdate.source,finalFlushReceived:metricUpdate.finalFlushReceived,flushReason:metricUpdate.flushReason,meaningfulInteraction:interaction.occurred,automatedClassification:automation.classification});
 }
 if(body.touchOnly||event==="session_heartbeat")return diagnosticResponse("session_touched");
 if(!body.touchSession){
  const attribution=body.attribution??{},sessionSeed:Record<string,unknown>={first_landing_url:clean(body.landingUrl,2000)||null,first_landing_path:clean(body.path,1000)||null,first_referrer:clean(body.referrer,2000)||null,page_increment:0,engaged_page_increment:0,meaningful_interaction_increment:0,automated_classification:automation.classification,automated_classification_reason:automation.reason};
  for(const key of attributionKeys)sessionSeed[key]=clean(attribution[key],500)||null;
  const {error:parentError}=await db.rpc("upsert_booking_attribution_session",{p_business_id:businessId,p_session_id:sessionId,p_patch:sessionSeed});
  if(parentError){
   console.error("Booking attribution session guarantee failed",{stage:"session_parent_insert",businessId,businessSlug,sessionId,event,code:parentError.code,message:parentError.message,details:parentError.details,hint:parentError.hint});
   return diagnosticResponse("session_parent_insert_failed");
  }
 }
 const inventoryItemId=clean(body.inventoryItemId,100)||null;
 const serviceId=clean(body.serviceId,100)||clean(metadata.service_id,100)||null;
 const eventKey=eventKeyFor({sessionId,event,interactionId:body.interactionId,path:body.path,inventoryItemId:body.inventoryItemId,serviceId:body.serviceId,metadata});
 const row={business_id:businessId,attribution_session_id:sessionId,event_name:event as BookingFunnelEvent,inventory_item_id:inventoryItemId,service_id:serviceId,event_key:eventKey,metadata};
 const {error}=await db.from("booking_funnel_events").insert(row);
 if(error&&error.code!=="23505"){
  if(event==="inventory_item_clicked"&&legacyClickConstraint(error)){
   const fallbackMetadata={...metadata,click_intent:true,original_event:event};
   const fallbackEventKey=eventKeyFor({sessionId,event:"inventory_item_view",interactionId:body.interactionId,path:body.path,inventoryItemId:body.inventoryItemId,serviceId:body.serviceId,metadata:fallbackMetadata});
   const {error:fallbackError}=await db.from("booking_funnel_events").insert({...row,event_name:"inventory_item_view",event_key:fallbackEventKey,metadata:fallbackMetadata});
   if(fallbackError&&fallbackError.code!=="23505")console.error("Booking funnel click fallback save failed",{stage:"event_insert_fallback",businessId,businessSlug,sessionId,event,inventoryItemId,serviceId,code:fallbackError.code,message:fallbackError.message,details:fallbackError.details,hint:fallbackError.hint});
  }else console.error("Booking funnel event save failed",{stage:"event_insert",businessId,businessSlug,sessionId,event,inventoryItemId,serviceId,code:error.code,message:error.message,details:error.details,hint:error.hint,source:normalizeMarketingSource(body.attribution)});
 }
 if(!error||error.code==="23505")logStage("Booking funnel event insert completed",{stage:"event_insert",businessId,businessSlug,sessionId,event,inventoryItemId,serviceId,deduped:error?.code==="23505",source:normalizeMarketingSource(body.attribution),hasGclid:Boolean(body.attribution?.gclid||body.attribution?.gbraid||body.attribution?.wbraid),hasFbclid:Boolean(body.attribution?.fbclid)});
 if(error&&error.code!=="23505"){diagnosticRequest(body,businessSlug,"rejected",{reason:"event_insert_failed"});return diagnosticResponse("event_insert_failed");}
 return diagnosticResponse(error?.code==="23505"?"deduped":"persisted");
}
