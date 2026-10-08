import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {resolveConfiguredInboundWebhookSecurity} from "@/lib/twilio/inboundWebhookSecurity";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";
import {inboundVoiceTwiml,normalizeVoicePhone} from "@/lib/twilio/voice";

export const runtime="nodejs";
const origin=(request:Request)=>(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,"");
export async function POST(request:Request){
 const params=new URLSearchParams(await request.text()),accountSid=params.get("AccountSid")??"",to=normalizeVoicePhone(params.get("To")??""),from=normalizeVoicePhone(params.get("From")??""),sid=params.get("CallSid")??"";
 const security=to?await resolveConfiguredInboundWebhookSecurity(accountSid,to):null;
 if(!security||!validTwilioSignature(twilioWebhookUrl(request,"TWILIO_VOICE_INBOUND_WEBHOOK_URL"),params,request.headers.get("x-twilio-signature")??"",security.token))return NextResponse.json({error:"Invalid signature"},{status:403});
 if(security.mode!=="tenant"||!security.businessId||!from||!to||!sid)return NextResponse.json({error:"Voice number is not configured"},{status:404});
 const businessId=security.businessId;
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const [{data:settings},{data:customer}]=await Promise.all([
  db.from("business_voice_settings").select("routing_mode,on_call_employee_id,fallback_employee_id,ring_timeout_seconds,recording_mode,enabled").eq("business_id",businessId).maybeSingle(),
  db.from("customers").select("id").eq("business_id",businessId).eq("phone_normalized",from).eq("is_deleted",false).maybeSingle(),
 ]);
 if(!settings?.enabled)return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>",{headers:{"Content-Type":"text/xml"}});
 const staffQuery=db.from("voice_call_staff").select("employee_id,phone_e164").eq("business_id",businessId).eq("enabled",true);
 const {data:staff}=settings.routing_mode==="on_call"&&settings.on_call_employee_id?await staffQuery.in("employee_id",[settings.on_call_employee_id,...(settings.fallback_employee_id?[settings.fallback_employee_id]:[])]):await staffQuery;
 const related=customer?.id?await db.from("bookings").select("id,job_id").eq("business_id",businessId).eq("customer_id",customer.id).in("status",["pending","confirmed"]).order("created_at",{ascending:false}).limit(2):{data:[]};
 const booking=related.data?.length===1?related.data[0]:null;
 await db.from("voice_calls").upsert({business_id:businessId,customer_id:customer?.id??null,booking_id:booking?.id??null,job_id:booking?.job_id??null,twilio_call_sid:sid,direction:"inbound",status:"ringing",from_number:from,to_number:to,routing_mode:settings.routing_mode,ringing_at:new Date().toISOString()},{onConflict:"twilio_call_sid"});
 const targets=(staff??[]).map(item=>({employeeId:item.employee_id,phone:item.phone_e164}));
 console.info("Twilio voice inbound routing",{businessId,callSid:sid,knownCustomer:Boolean(customer),mode:settings.routing_mode,targetCount:targets.length});
 if(!targets.length)return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>",{headers:{"Content-Type":"text/xml"}});
 return new Response(inboundVoiceTwiml({callId:sid,businessId,targets,timeout:settings.ring_timeout_seconds,record:["incoming","all"].includes(settings.recording_mode),origin:origin(request)}),{headers:{"Content-Type":"text/xml"}});
}
