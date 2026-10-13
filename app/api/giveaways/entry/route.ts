import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeGiveawayEmail,validGiveawayEmail,verifyTurnstile} from "@/lib/eventGiveaway";
import {sendGiveawayConfirmation} from "@/lib/communications/giveawayEmailService";
export async function POST(req:Request){
 const body=await req.json().catch(()=>null),db=getSupabaseAdmin(),neutral={ok:true,message:"Thanks — check your email for giveaway details."};if(!db||!body||body.website)return NextResponse.json(neutral);
 const firstName=String(body.firstName??"").trim().slice(0,100),email=normalizeGiveawayEmail(String(body.email??"")),giveawayId=String(body.giveawayId??"");if(!firstName||!validGiveawayEmail(email)||!/^[0-9a-f-]{36}$/i.test(giveawayId))return NextResponse.json({ok:false,error:"Enter your first name and a valid email address."},{status:400});
 const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",hash=createHash("sha256").update(`${process.env.WEBSITE_REQUEST_HASH_SALT??"servonas"}:${ip}`).digest("hex");
 if(!await verifyTurnstile(String(body.turnstileToken??""),ip,{hostname:new URL(req.url).hostname,action:"giveaway_entry"}))return NextResponse.json({ok:false,error:"Please complete the verification and try again."},{status:400});
 const {data:g}=await db.from("event_giveaways").select("id,business_id,entry_starts_at,entry_ends_at,discount_id,businesses(name,email)").eq("id",giveawayId).eq("status","published").maybeSingle(),now=Date.now();
 if(!g||now<new Date(g.entry_starts_at).getTime()||now>=new Date(g.entry_ends_at).getTime())return NextResponse.json({ok:false,error:"This giveaway is not accepting entries."},{status:404});
 const {count}=await db.from("event_giveaway_entries").select("id",{count:"exact",head:true}).eq("business_id",g.business_id).eq("submitted_ip_hash",hash).gte("created_at",new Date(now-3600000).toISOString());if((count??0)>=5)return NextResponse.json({ok:false,error:"Please try again later."},{status:429});
 const emailConsent=body.emailConsent===true,smsConsent=body.smsConsent===true,{data:entry,error}=await db.from("event_giveaway_entries").insert({business_id:g.business_id,giveaway_id:g.id,first_name:firstName,email,phone:String(body.phone??"").trim()||null,email_marketing_consent:emailConsent,email_marketing_consented_at:emailConsent?new Date().toISOString():null,email_marketing_consent_text:emailConsent?"I agree to receive marketing email.":null,sms_marketing_consent:smsConsent,sms_marketing_consented_at:smsConsent?new Date().toISOString():null,sms_marketing_consent_text:smsConsent?"I agree to receive marketing texts.":null,submitted_ip_hash:hash,user_agent:req.headers.get("user-agent")}).select("id").maybeSingle();
 if(error&&error.code!=="23505")return NextResponse.json({ok:false,error:"We could not save your entry."},{status:500});
 const {data:d}=g.discount_id?await db.from("discounts").select("code,expires_at,minimum_subtotal_cents").eq("business_id",g.business_id).eq("id",g.discount_id).eq("is_active",true).maybeSingle():{data:null};
 if(entry&&d){const b=Array.isArray(g.businesses)?g.businesses[0]:g.businesses;void sendGiveawayConfirmation({businessId:g.business_id,entryId:entry.id,email,businessName:b?.name||"Your business",replyTo:b?.email||null,code:d.code,expiresAt:d.expires_at,minimumSubtotalCents:d.minimum_subtotal_cents})}
 return NextResponse.json({...neutral,discount:d?{code:d.code,expiresAt:d.expires_at,minimumSubtotalCents:d.minimum_subtotal_cents}:null});
}
