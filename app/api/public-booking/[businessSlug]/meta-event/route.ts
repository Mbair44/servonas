import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {sendMetaConversion} from "@/lib/metaConversions";

const eventIdPattern=/^initiatecheckout-[a-z0-9-]{20,100}$/i;
const pixelPattern=/^[0-9]{8,24}$/;
const clean=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
const customData=(value:unknown)=>{if(!value||typeof value!=="object"||Array.isArray(value))return {};return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([key,item])=>/^[a-z][a-z0-9_]{0,60}$/i.test(key)&&(typeof item==="string"||typeof item==="number"||typeof item==="boolean"||Array.isArray(item))));};

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const body=await request.json().catch(()=>null) as {event?:unknown;eventId?:unknown;eventSourceUrl?:unknown;customData?:unknown;fbp?:unknown;fbc?:unknown}|null;
 const event=body?.event==="InitiateCheckout"?body.event:null,eventId=clean(body?.eventId,110);
 if(!event||!eventIdPattern.test(eventId))return NextResponse.json({error:"Invalid Meta event."},{status:400});
 const db=getSupabaseAdmin();
 if(!db)return new NextResponse(null,{status:204});
 const {businessSlug}=await params;
 const {data:booking}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 const businessId=booking?.business_id;
 if(!businessId)return new NextResponse(null,{status:204});
 const {data:website}=await db.from("business_website_settings").select("meta_pixel_id").eq("business_id",businessId).eq("status","published").maybeSingle();
 const pixelId=clean(website?.meta_pixel_id,24);
 if(!pixelPattern.test(pixelId))return new NextResponse(null,{status:204});
 const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-real-ip")?.trim()||null;
 await sendMetaConversion({businessId,businessSlug,pixelId,event,eventId,eventSourceUrl:clean(body?.eventSourceUrl,2000),userAgent:clean(request.headers.get("user-agent"),500),clientIp:forwarded,fbp:clean(body?.fbp,200)||null,fbc:clean(body?.fbc,200)||null,customData:customData(body?.customData)});
 return new NextResponse(null,{status:204});
}
