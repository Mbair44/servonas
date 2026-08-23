import {NextResponse} from "next/server";
import {attributionKeys,bookingFunnelEvents,validSessionId,type AttributionValues,type BookingFunnelEvent} from "@/lib/bookingFunnel";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {unstable_cache} from "next/cache";

const bots=/bot|crawler|spider|facebookexternalhit|googleother|headless|lighthouse|playwright|puppeteer/i;
const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().slice(0,max):"";
const allowed=new Set<string>(bookingFunnelEvents);
const safeMetadata=(value:unknown)=>{if(!value||typeof value!=="object"||Array.isArray(value))return {};const out:Record<string,string|number|boolean|null>={};for(const [key,item] of Object.entries(value as Record<string,unknown>)){if(!/^[a-z][a-z0-9_]{0,60}$/i.test(key))continue;if(typeof item==="string")out[key]=clean(item,200);else if(typeof item==="number"&&Number.isFinite(item))out[key]=item;else if(typeof item==="boolean"||item===null)out[key]=item;}return out;};
const eventKeyFor=(body:{sessionId:string;event:string;path?:string;inventoryItemId?:string;metadata?:object})=>{
 const metadata=safeMetadata(body.metadata);
 const parts=[body.sessionId,body.event];
 switch(body.event){
 case "landing_page_view":
  return `${body.sessionId}:landing:${clean(body.path,1000)}`;
 case "inventory_item_view":
 case "inventory_item_clicked":
 case "check_availability_clicked":
 case "reserve_clicked":
 case "item_added_to_cart":
  parts.push(clean(body.inventoryItemId,100)||"none",String(metadata.date??""),String(metadata.source_flow??""),String(metadata.interaction_source??""));
  break;
 case "availability_check_started":
  parts.push(clean(body.path,1000),String(metadata.source_flow??""));
  break;
 case "event_date_selected":
 case "event_date_changed":
  parts.push(clean(body.inventoryItemId,100)||"none",String(metadata.date??""),String(metadata.range_end??""),String(metadata.source_flow??""));
  break;
 case "rental_availability_checked":
 case "rental_available":
 case "rental_unavailable":
 case "available_inventory_viewed":
  parts.push(clean(body.inventoryItemId,100)||"none",String(metadata.date??""),String(metadata.range_end??""),String(metadata.source_flow??""),String(metadata.available_count??""));
  break;
 case "booking_started":
 case "customer_info_entered":
 case "checkout_started":
  parts.push(clean(body.path,1000),String(metadata.date??""),String(metadata.source_flow??""),String(metadata.item_count??""));
  break;
 default:
  return null;
 }
 return parts.join(":").slice(0,500);
};
const businessIdForBookingSlug=unstable_cache(async(businessSlug:string)=>{const db=getSupabaseAdmin();if(!db)return null;const {data:settings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();return settings?.business_id??null;},["booking-funnel-business-id"],{revalidate:300});

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const purpose=request.headers.get("purpose")||request.headers.get("x-middleware-prefetch")||"",ua=request.headers.get("user-agent")||"";
 if(/prefetch/i.test(purpose)||bots.test(ua))return new NextResponse(null,{status:204});
 const body=await request.json().catch(()=>null) as {sessionId?:string;event?:string;path?:string;landingUrl?:string;referrer?:string;attribution?:AttributionValues;inventoryItemId?:string;metadata?:object;touchSession?:boolean}|null;
 if(!body||!validSessionId(body.sessionId)||!body.event||!allowed.has(body.event))return NextResponse.json({error:"Invalid analytics event."},{status:400});
 const sessionId=body.sessionId as string,event=body.event as string;
 const db=getSupabaseAdmin();if(!db)return new NextResponse(null,{status:204});
 const {businessSlug}=await params,businessId=await businessIdForBookingSlug(businessSlug);
 if(!businessId)return new NextResponse(null,{status:204});
 if(body.touchSession){
  const attribution=body.attribution??{},first:Record<string,unknown>={id:sessionId,business_id:businessId,first_landing_url:clean(body.landingUrl,2000)||null,first_landing_path:clean(body.path,1000)||null,first_referrer:clean(body.referrer,2000)||null,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  for(const key of attributionKeys)first[key]=clean(attribution[key],500)||null;
  const sessionRow={...first,business_id:businessId};
  const {error:sessionError}=await db.from("booking_attribution_sessions").upsert(sessionRow,{onConflict:"business_id,id"});
  if(sessionError){console.error("Booking attribution session save failed",{businessId,code:sessionError.code});return new NextResponse(null,{status:204});}
 }
 const eventKey=eventKeyFor({sessionId,event,path:body.path,inventoryItemId:body.inventoryItemId,metadata:body.metadata});
 const {error}=await db.from("booking_funnel_events").insert({business_id:businessId,attribution_session_id:sessionId,event_name:event as BookingFunnelEvent,inventory_item_id:clean(body.inventoryItemId,100)||null,event_key:eventKey,metadata:safeMetadata(body.metadata)});
 if(error&&error.code!=="23505")console.error("Booking funnel event save failed",{businessId,event,code:error.code});
 return new NextResponse(null,{status:204});
}
