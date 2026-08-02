import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {sendTwilioMessage} from "@/lib/communications/twilioMessage";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";

export const runtime="nodejs";
const missedStatuses=new Set(["no-answer","busy","failed","canceled"]);
const normalize=(value:string)=>{const digits=value.replace(/\D/g,"");return digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith("1")?`+${digits}`:value.startsWith("+")&&digits.length>=8&&digits.length<=15?`+${digits}`:null;};

export async function POST(request:Request){
 const raw=await request.text(),params=new URLSearchParams(raw),signature=request.headers.get("x-twilio-signature")??"",token=process.env.TWILIO_AUTH_TOKEN,url=twilioWebhookUrl(request,"TWILIO_MISSED_CALL_WEBHOOK_URL");
 if(!token||!validTwilioSignature(url,params,signature,token))return NextResponse.json({error:"Invalid signature"},{status:403});
 const callId=params.get("CallSid")??"",status=(params.get("CallStatus")??params.get("DialCallStatus")??"").toLowerCase();if(!missedStatuses.has(status))return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
 const from=normalize(params.get("From")??""),to=normalize(params.get("To")??"");if(!callId||!from||!to)return NextResponse.json({error:"Invalid call data"},{status:400});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data:settings}=await db.from("business_missed_call_settings").select("business_id,initial_sms_body,recovery_number_e164").eq("enabled",true).eq("recovery_number_e164",to).maybeSingle();if(!settings)return NextResponse.json({error:"Number not configured"},{status:404});
 const existing=await db.from("missed_call_recovery_leads").select("id").eq("provider","twilio").eq("provider_call_id",callId).maybeSingle();if(existing.data)return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
 let {data:customer}=await db.from("customers").select("id,sms_consent_status").eq("business_id",settings.business_id).eq("phone_normalized",from).eq("is_deleted",false).order("created_at").limit(1).maybeSingle();
 if(!customer){const created=await db.from("customers").insert({business_id:settings.business_id,first_name:"Missed Call",last_name:from.slice(-4),phone:from,phone_normalized:from,preferred_contact_method:"sms",tags:["missed-call-lead"],lead_source:"Missed inbound call",notes:"Created automatically from a missed inbound business call.",is_active:true,sms_consent_status:"inbound_contact",sms_consent_recorded_at:new Date().toISOString(),intake_data:{source:"missed_call",verification:"unconfirmed"},intake_data_verified:false}).select("id,sms_consent_status").single();customer=created.data;}
 if(!customer)return NextResponse.json({error:"Customer intake failed"},{status:500});
 await db.from("customer_sms_consents").upsert({business_id:settings.business_id,customer_id:customer.id,phone_e164:from,status:customer.sms_consent_status==="opted_out"?"opted_out":"inbound_contact",source:"missed_call",provider_message_id:callId,evidence:{call_status:status,initiated_recovery:customer.sms_consent_status!=="opted_out"}},{onConflict:"business_id,phone_e164"});
 const {data:lead,error}=await db.from("missed_call_recovery_leads").insert({business_id:settings.business_id,customer_id:customer.id,provider_call_id:callId,from_phone_e164:from,to_phone_e164:to,call_status:status,last_message_at:new Date().toISOString()}).select("id").single();
 if(error){if(error.code==="23505")return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});console.error("Missed-call lead creation failed",{code:error.code,callId});return NextResponse.json({error:"Lead creation failed"},{status:500});}
 if(customer.sms_consent_status==="opted_out"){await db.from("missed_call_recovery_leads").update({conversation_status:"opted_out",lead_status:"lost"}).eq("id",lead.id);return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});}
 const message=await db.from("missed_call_recovery_messages").insert({business_id:settings.business_id,lead_id:lead.id,customer_id:customer.id,direction:"outbound",body:settings.initial_sms_body,delivery_status:"pending"}).select("id").single();
 try{const sent=await sendTwilioMessage({to:from,from:to,body:settings.initial_sms_body});await db.from("missed_call_recovery_messages").update({provider_message_id:sent.sid,delivery_status:"sent"}).eq("id",message.data?.id);await db.from("missed_call_recovery_leads").update({lead_status:"contacted"}).eq("id",lead.id);}catch(error){const detail=error instanceof Error?error.message:"Delivery failed";await db.from("missed_call_recovery_messages").update({delivery_status:"failed",error_message:detail.slice(0,1000)}).eq("id",message.data?.id);console.error("Missed-call recovery SMS failed",{leadId:lead.id,message:detail});}
 await db.from("business_activity").insert({business_id:settings.business_id,action:"missed_call_recovery_started",entity_type:"customer",entity_id:customer.id,summary:"Missed call recovery text conversation started"});
 return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
}
