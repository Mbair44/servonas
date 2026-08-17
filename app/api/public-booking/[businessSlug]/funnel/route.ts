import {NextResponse} from "next/server";
import {attributionKeys,bookingFunnelEvents,validSessionId,type AttributionValues,type BookingFunnelEvent} from "@/lib/bookingFunnel";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const bots=/bot|crawler|spider|facebookexternalhit|googleother|headless|lighthouse|playwright|puppeteer/i;
const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().slice(0,max):"";
const allowed=new Set<string>(bookingFunnelEvents);
const safeMetadata=(value:unknown)=>{if(!value||typeof value!=="object"||Array.isArray(value))return {};const out:Record<string,string|number|boolean|null>={};for(const [key,item] of Object.entries(value as Record<string,unknown>)){if(!/^[a-z][a-z0-9_]{0,60}$/i.test(key))continue;if(typeof item==="string")out[key]=clean(item,200);else if(typeof item==="number"&&Number.isFinite(item))out[key]=item;else if(typeof item==="boolean"||item===null)out[key]=item;}return out;};

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const purpose=request.headers.get("purpose")||request.headers.get("x-middleware-prefetch")||"",ua=request.headers.get("user-agent")||"";
 if(/prefetch/i.test(purpose)||bots.test(ua))return new NextResponse(null,{status:204});
 const body=await request.json().catch(()=>null) as {sessionId?:string;event?:string;path?:string;landingUrl?:string;referrer?:string;attribution?:AttributionValues;inventoryItemId?:string;metadata?:object}|null;
 if(!body||!validSessionId(body.sessionId)||!body.event||!allowed.has(body.event))return NextResponse.json({error:"Invalid analytics event."},{status:400});
 const db=getSupabaseAdmin();if(!db)return new NextResponse(null,{status:204});
 const {businessSlug}=await params,{data:settings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 if(!settings)return new NextResponse(null,{status:204});
 const attribution=body.attribution??{},first:Record<string,unknown>={id:body.sessionId,business_id:settings.business_id,first_landing_url:clean(body.landingUrl,2000)||null,first_landing_path:clean(body.path,1000)||null,first_referrer:clean(body.referrer,2000)||null,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 for(const key of attributionKeys)first[key]=clean(attribution[key],500)||null;
 const {error:insertError}=await db.from("booking_attribution_sessions").insert(first);
 if(insertError&&insertError.code!=="23505"){console.error("Booking attribution session save failed",{businessId:settings.business_id,code:insertError.code});return new NextResponse(null,{status:204});}
 if(insertError?.code==="23505"){
  // A browser-generated identifier can only update a session already owned by this tenant.
  const {error:touchError}=await db.from("booking_attribution_sessions").update({last_seen_at:first.last_seen_at,updated_at:first.updated_at}).eq("id",body.sessionId).eq("business_id",settings.business_id);
  if(touchError){console.error("Booking attribution session touch failed",{businessId:settings.business_id,code:touchError.code});return new NextResponse(null,{status:204});}
 }
 const eventKey=body.event==="landing_page_view"?`${body.sessionId}:landing:${clean(body.path,1000)}`:null;
 const {error}=await db.from("booking_funnel_events").insert({business_id:settings.business_id,attribution_session_id:body.sessionId,event_name:body.event as BookingFunnelEvent,inventory_item_id:clean(body.inventoryItemId,100)||null,event_key:eventKey,metadata:safeMetadata(body.metadata)});
 if(error&&error.code!=="23505")console.error("Booking funnel event save failed",{businessId:settings.business_id,event:body.event,code:error.code});
 return new NextResponse(null,{status:204});
}
