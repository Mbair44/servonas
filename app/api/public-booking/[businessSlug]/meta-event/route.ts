import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {sendMetaConversion} from "@/lib/metaConversions";

const initiateCheckoutEventIdPattern=/^initiatecheckout-[a-z0-9-]{20,100}$/i;
const purchaseEventIdPattern=/^purchase-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const pixelPattern=/^[0-9]{8,24}$/;
const clean=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
const customData=(value:unknown)=>{if(!value||typeof value!=="object"||Array.isArray(value))return {};return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([key,item])=>/^[a-z][a-z0-9_]{0,60}$/i.test(key)&&(typeof item==="string"||typeof item==="number"||typeof item==="boolean"||Array.isArray(item))));};

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const body=await request.json().catch(()=>null) as {event?:unknown;eventId?:unknown;eventSourceUrl?:unknown;bookingId?:unknown;customData?:unknown;fbp?:unknown;fbc?:unknown}|null;
 const event=body?.event==="InitiateCheckout"||body?.event==="Purchase"?body.event:null,eventId=clean(body?.eventId,110),bookingId=clean(body?.bookingId,80);
 if(!event||(event==="InitiateCheckout"?!initiateCheckoutEventIdPattern.test(eventId):!purchaseEventIdPattern.test(eventId)))return NextResponse.json({error:"Invalid Meta event."},{status:400});
 const db=getSupabaseAdmin();
 if(!db)return new NextResponse(null,{status:204});
 const {businessSlug}=await params;
 const {data:booking}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 const {data:website}=booking?{data:null}:await db.from("business_website_settings").select("business_id").ilike("public_slug",businessSlug).eq("status","published").maybeSingle();
 const businessId=booking?.business_id??website?.business_id;
 if(!businessId)return new NextResponse(null,{status:204});
 let purchaseData:Record<string,unknown>|null=null;
 if(event==="Purchase"){
  const expectedBookingId=purchaseEventIdPattern.exec(eventId)?.[1]?.toLowerCase();
  if(!expectedBookingId||bookingId.toLowerCase()!==expectedBookingId)return NextResponse.json({error:"Invalid purchase event."},{status:400});
  const {data:confirmedBooking}=await db.from("bookings").select("id,status,total_cents").eq("id",bookingId).eq("business_id",businessId).eq("status","confirmed").maybeSingle();
  if(!confirmedBooking)return new NextResponse(null,{status:204});
  const totalCents=Number(confirmedBooking.total_cents);
  if(!Number.isSafeInteger(totalCents)||totalCents<0)return new NextResponse(null,{status:204});
  purchaseData={...customData(body?.customData),value:totalCents/100,currency:"USD",transaction_id:confirmedBooking.id};
 }
 const {data:websiteSettings}=await db.from("business_website_settings").select("meta_pixel_id").eq("business_id",businessId).eq("status","published").maybeSingle();
 const pixelId=clean(websiteSettings?.meta_pixel_id,24);
 if(!pixelPattern.test(pixelId))return new NextResponse(null,{status:204});
 const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-real-ip")?.trim()||null;
 await sendMetaConversion({businessId,businessSlug,pixelId,event,eventId,eventSourceUrl:clean(body?.eventSourceUrl,2000),userAgent:clean(request.headers.get("user-agent"),500),clientIp:forwarded,fbp:clean(body?.fbp,200)||null,fbc:clean(body?.fbc,200)||null,customData:purchaseData??customData(body?.customData)});
 return new NextResponse(null,{status:204});
}
