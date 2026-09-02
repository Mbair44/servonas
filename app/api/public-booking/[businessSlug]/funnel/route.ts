import {NextResponse} from "next/server";
import {attributionKeys,bookingFunnelEvents,validSessionId,type AttributionValues,type BookingFunnelEvent} from "@/lib/bookingFunnel";
import {bookingFunnelEnabled} from "@/lib/optionalAnalytics";
import {normalizeMarketingSource} from "@/lib/marketingAttribution";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {unstable_cache} from "next/cache";

const bots=/bot|crawler|spider|facebookexternalhit|googleother|headless|lighthouse|playwright|puppeteer/i;
const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().slice(0,max):"";
const allowed=new Set<string>(bookingFunnelEvents.filter((event)=>event!=="booking_completed"&&event!=="payment_completed"));
const safeMetadata=(value:unknown)=>{if(!value||typeof value!=="object"||Array.isArray(value))return {};const out:Record<string,string|number|boolean|null>={};for(const [key,item] of Object.entries(value as Record<string,unknown>)){if(!/^[a-z][a-z0-9_]{0,60}$/i.test(key))continue;if(typeof item==="string")out[key]=clean(item,200);else if(typeof item==="number"&&Number.isFinite(item))out[key]=item;else if(typeof item==="boolean"||item===null)out[key]=item;}return out;};
const legacyClickConstraint=(error:{code?:string;message?:string;details?:string}|null)=>Boolean(error?.code==="23514"&&(error.message?.includes("booking_funnel_events_event_name_check")||error.details?.includes("booking_funnel_events_event_name_check")));
const diagnosticsEnabled=()=>process.env.BOOKING_FUNNEL_DIAGNOSTICS==="1";
const logStage=(message:string,details:Record<string,unknown>)=>{if(diagnosticsEnabled())console.info(message,details);};
const pageType=(value:unknown)=>{const next=clean(value,40).toLowerCase();return next&&/^[a-z_]+$/.test(next)?next:null;};
const wholeNumber=(value:unknown,max=3600)=>{const next=Number(value);if(!Number.isFinite(next))return 0;return Math.max(0,Math.min(max,Math.round(next)));};
const nullableWholeNumber=(value:unknown,max=3_600_000)=>{if(value==null||value==="")return null;const next=Number(value);if(!Number.isFinite(next))return null;return Math.max(0,Math.min(max,Math.round(next)));};
const textValue=(value:unknown,max=80)=>{const next=clean(value,max);return next||null;};
const sessionMetricUpdate=(metadata:Record<string,unknown>)=>{
 const milliseconds=nullableWholeNumber(metadata.active_duration_increment_milliseconds);
 const legacySeconds=wholeNumber(metadata.session_duration_increment_seconds);
 const incrementMilliseconds=milliseconds??(legacySeconds?legacySeconds*1000:null);
 const source=metadata.timing_event_type==="final_flush"?"final_flush":metadata.timing_event_type==="heartbeat"?"heartbeat":null;
 return {incrementMilliseconds,source,finalFlushReceived:metadata.timing_is_final===true,flushReason:textValue(metadata.timing_flush_reason,40)};
};
const eventKeyFor=(body:{sessionId:string;event:string;path?:string;inventoryItemId?:string;serviceId?:string;metadata?:object})=>{
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
 case "lead_submitted":
 case "checkout_started":
  parts.push(clean(body.path,1000),clean(body.serviceId,100)||"none",String(metadata.date??""),String(metadata.source_flow??""),String(metadata.item_count??""));
  break;
 default:
  return null;
 }
 return parts.join(":").slice(0,500);
};
const businessIdForBookingSlug=unstable_cache(async(businessSlug:string)=>{const db=getSupabaseAdmin();if(!db)return null;const {data:bookingSettings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();if(bookingSettings?.business_id)return bookingSettings.business_id;const {data:websiteSettings}=await db.from("business_website_settings").select("business_id").ilike("public_slug",businessSlug).eq("status","published").maybeSingle();return websiteSettings?.business_id??null;},["booking-funnel-business-id"],{revalidate:300});

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 if(!bookingFunnelEnabled())return new NextResponse(null,{status:204});
 const purpose=request.headers.get("purpose")||request.headers.get("x-middleware-prefetch")||"",ua=request.headers.get("user-agent")||"";
 if(/prefetch/i.test(purpose)||bots.test(ua))return new NextResponse(null,{status:204});
 const body=await request.json().catch(()=>null) as {sessionId?:string;event?:string;path?:string;pageType?:string;landingUrl?:string;referrer?:string;attribution?:AttributionValues;inventoryItemId?:string;serviceId?:string;metadata?:object;touchSession?:boolean;touchOnly?:boolean}|null;
 if(!body||!validSessionId(body.sessionId)||!body.event||!allowed.has(body.event))return NextResponse.json({error:"Invalid analytics event."},{status:400});
 const sessionId=body.sessionId as string,event=body.event as string;
 const db=getSupabaseAdmin();if(!db)return new NextResponse(null,{status:204});
 const {businessSlug}=await params,businessId=await businessIdForBookingSlug(businessSlug);
 if(!businessId)return new NextResponse(null,{status:204});
 const metadata=safeMetadata(body.metadata);
 if(body.touchSession||body.touchOnly){
  const nowIso=new Date().toISOString(),attribution=body.attribution??{},sessionPath=clean(body.path,1000)||null,sessionPageType=pageType(body.pageType),metricUpdate=sessionMetricUpdate(metadata),first:Record<string,unknown>={id:sessionId,business_id:businessId,first_landing_url:clean(body.landingUrl,2000)||null,first_landing_path:sessionPath,first_referrer:clean(body.referrer,2000)||null,last_seen_at:nowIso,updated_at:nowIso,session_started_at:nowIso,session_ended_at:metricUpdate.finalFlushReceived?nowIso:null,entry_path:sessionPath,last_path:sessionPath,entry_page_type:sessionPageType,last_page_type:sessionPageType,total_session_duration_seconds:metricUpdate.incrementMilliseconds==null?0:Math.round(metricUpdate.incrementMilliseconds/1000),engaged_duration_seconds:metricUpdate.incrementMilliseconds==null?0:Math.round(metricUpdate.incrementMilliseconds/1000),total_session_duration_milliseconds:metricUpdate.incrementMilliseconds,engaged_duration_milliseconds:metricUpdate.incrementMilliseconds,duration_source:metricUpdate.source,duration_final_flush_received:metricUpdate.finalFlushReceived,duration_last_flush_reason:metricUpdate.flushReason,page_count:body.event==="landing_page_view"||body.event==="landing_view"?1:0,engaged_page_count:["service_view","inventory_view","inventory_item_view","rental_viewed","available_inventory_viewed"].includes(event)?1:0,browser:textValue(metadata.browser),operating_system:textValue(metadata.operating_system),device_type:textValue(metadata.device_type)};
  for(const key of attributionKeys)first[key]=clean(attribution[key],500)||null;
  const {data:existing,error:existingError}=await db.from("booking_attribution_sessions").select("id,page_count,engaged_page_count,total_session_duration_seconds,engaged_duration_seconds,total_session_duration_milliseconds,engaged_duration_milliseconds,duration_source,duration_final_flush_received,duration_last_flush_reason").eq("business_id",businessId).eq("id",sessionId).maybeSingle();
  if(existingError){console.error("Booking attribution session lookup failed",{stage:"session_lookup",businessId,businessSlug,event,code:existingError.code});return new NextResponse(null,{status:204});}
  const pageIncrement=body.event==="landing_page_view"||body.event==="landing_view"?1:0;
  const engagedIncrement=["service_view","inventory_view","inventory_item_view","rental_viewed","available_inventory_viewed"].includes(event)?1:0;
  const previousMilliseconds=existing?(existing.total_session_duration_milliseconds==null?Math.max(0,Number(existing.total_session_duration_seconds??0))*1000:Math.max(0,Number(existing.total_session_duration_milliseconds))):0;
  const nextMilliseconds=metricUpdate.incrementMilliseconds==null?previousMilliseconds:previousMilliseconds+metricUpdate.incrementMilliseconds;
  const sessionRow=existing?{last_seen_at:nowIso,updated_at:nowIso,session_ended_at:metricUpdate.finalFlushReceived?nowIso:null,last_path:sessionPath,last_page_type:sessionPageType,browser:textValue(metadata.browser),operating_system:textValue(metadata.operating_system),device_type:textValue(metadata.device_type),page_count:Math.max(0,Number(existing.page_count??0))+pageIncrement,engaged_page_count:Math.max(0,Number(existing.engaged_page_count??0))+engagedIncrement,total_session_duration_seconds:Math.round(nextMilliseconds/1000),engaged_duration_seconds:Math.round(nextMilliseconds/1000),total_session_duration_milliseconds:metricUpdate.incrementMilliseconds==null?existing.total_session_duration_milliseconds:nextMilliseconds,engaged_duration_milliseconds:metricUpdate.incrementMilliseconds==null?existing.engaged_duration_milliseconds:nextMilliseconds,duration_source:metricUpdate.source??existing.duration_source??null,duration_final_flush_received:Boolean(existing.duration_final_flush_received)||metricUpdate.finalFlushReceived,duration_last_flush_reason:metricUpdate.flushReason??existing.duration_last_flush_reason??null}:first;
  const sessionWrite=existing?db.from("booking_attribution_sessions").update(sessionRow).eq("business_id",businessId).eq("id",sessionId):db.from("booking_attribution_sessions").insert(sessionRow);
  const {error:sessionError}=await sessionWrite;
  if(sessionError){console.error("Booking attribution session save failed",{stage:"session_upsert",businessId,businessSlug,event,code:sessionError.code});return new NextResponse(null,{status:204});}
  logStage("Booking funnel session upsert completed",{stage:"session_upsert",businessId,businessSlug,sessionId,event,source:normalizeMarketingSource(attribution),hasGclid:Boolean(attribution.gclid||attribution.gbraid||attribution.wbraid),hasFbclid:Boolean(attribution.fbclid),touchSession:Boolean(body.touchSession),touchOnly:Boolean(body.touchOnly),pageType:sessionPageType,activeMilliseconds:metricUpdate.incrementMilliseconds,durationSource:metricUpdate.source,finalFlushReceived:metricUpdate.finalFlushReceived,flushReason:metricUpdate.flushReason});
 }
 if(body.touchOnly||event==="session_heartbeat")return new NextResponse(null,{status:204});
 const inventoryItemId=clean(body.inventoryItemId,100)||null;
 const serviceId=clean(body.serviceId,100)||clean(metadata.service_id,100)||null;
 const eventKey=eventKeyFor({sessionId,event,path:body.path,inventoryItemId:body.inventoryItemId,serviceId:body.serviceId,metadata});
 const row={business_id:businessId,attribution_session_id:sessionId,event_name:event as BookingFunnelEvent,inventory_item_id:inventoryItemId,service_id:serviceId,event_key:eventKey,metadata};
 const {error}=await db.from("booking_funnel_events").insert(row);
 if(error&&error.code!=="23505"){
  if(event==="inventory_item_clicked"&&legacyClickConstraint(error)){
   const fallbackMetadata={...metadata,click_intent:true,original_event:event};
   const fallbackEventKey=eventKeyFor({sessionId,event:"inventory_item_view",path:body.path,inventoryItemId:body.inventoryItemId,serviceId:body.serviceId,metadata:fallbackMetadata});
   const {error:fallbackError}=await db.from("booking_funnel_events").insert({...row,event_name:"inventory_item_view",event_key:fallbackEventKey,metadata:fallbackMetadata});
   if(fallbackError&&fallbackError.code!=="23505")console.error("Booking funnel click fallback save failed",{stage:"event_insert_fallback",businessId,businessSlug,event,inventoryItemId,serviceId,code:fallbackError.code});
  }else console.error("Booking funnel event save failed",{stage:"event_insert",businessId,businessSlug,event,inventoryItemId,serviceId,code:error.code,source:normalizeMarketingSource(body.attribution)});
 }
 if(!error||error.code==="23505")logStage("Booking funnel event insert completed",{stage:"event_insert",businessId,businessSlug,sessionId,event,inventoryItemId,serviceId,deduped:error?.code==="23505",source:normalizeMarketingSource(body.attribution),hasGclid:Boolean(body.attribution?.gclid||body.attribution?.gbraid||body.attribution?.wbraid),hasFbclid:Boolean(body.attribution?.fbclid)});
 return new NextResponse(null,{status:204});
}
