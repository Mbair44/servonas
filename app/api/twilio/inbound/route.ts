import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getTwilioCredentials} from "@/lib/communications/twilioCredentials";
import {advanceMissedCallConversation} from "@/lib/missedCallRecovery";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";

export const runtime="nodejs";

type IntakeResult={duplicate:boolean;message_id:string;business_id:string;customer_id:string;reply:boolean;reply_body?:string;to?:string;from?:string};

export async function POST(request:Request){
 const raw=await request.text(),params=new URLSearchParams(raw),signature=request.headers.get("x-twilio-signature")??"";
 const token=process.env.TWILIO_AUTH_TOKEN,webhookUrl=twilioWebhookUrl(request,"TWILIO_INBOUND_WEBHOOK_URL");
 if(!token||!validTwilioSignature(webhookUrl,params,signature,token))return NextResponse.json({error:"Invalid signature"},{status:403});
 const sid=params.get("MessageSid")??params.get("SmsMessageSid")??"",from=params.get("From")??"",to=params.get("To")??"",body=params.get("Body")??"";
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data,error}=await db.rpc("process_inbound_sms",{p_provider_message_id:sid,p_from_phone:from,p_to_phone:to,p_body:body});
 if(error){
  console.error("Inbound SMS processing failed",{code:error.code,message:error.message,sid});
  return NextResponse.json({error:error.code==="P0002"?"Number not configured":"Processing failed"},{status:error.code==="P0002"?404:500});
 }
 const result=data as IntakeResult;
 const recovery=await advanceMissedCallConversation(db,{businessId:result.business_id,customerId:result.customer_id,providerMessageId:sid,body});
 if(recovery)return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
 if(result.duplicate||!result.reply)return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
 const twilio=getTwilioCredentials();
 if(!twilio.configured){
  await db.from("inbound_sms_messages").update({auto_reply_status:"failed",auto_reply_error:"Twilio outbound delivery is not configured."}).eq("id",result.message_id);
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
 }
 try{
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${twilio.username}:${twilio.password}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({To:result.to!,From:result.from!,Body:result.reply_body!})});
  const provider=await response.json() as {sid?:string;message?:string};
  if(!response.ok||!provider.sid)throw new Error(provider.message||`Twilio HTTP ${response.status}`);
  await db.from("inbound_sms_messages").update({auto_reply_status:"sent",auto_reply_provider_message_id:provider.sid,auto_reply_error:null}).eq("id",result.message_id);
 }catch(error){
  const message=error instanceof Error?error.message:"Auto reply failed";
  await db.from("inbound_sms_messages").update({auto_reply_status:"failed",auto_reply_error:message.slice(0,1000)}).eq("id",result.message_id);
  console.error("Inbound SMS auto reply failed",{messageId:result.message_id,message});
 }
 return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
}
