import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {refreshCampaignCounts} from "@/lib/communications/customerCampaignDelivery";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";

export async function POST(request:Request){
 const raw=await request.text(),params=new URLSearchParams(raw),signature=request.headers.get("x-twilio-signature")??"",token=process.env.TWILIO_AUTH_TOKEN,url=twilioWebhookUrl(request,"TWILIO_CAMPAIGN_STATUS_WEBHOOK_URL");
 if(!token||!validTwilioSignature(url,params,signature,token))return NextResponse.json({error:"Invalid signature"},{status:403});
 const sid=params.get("MessageSid"),messageStatus=params.get("MessageStatus")??"",db=getSupabaseAdmin();if(!sid||!db)return NextResponse.json({ok:true});
 const {data:recipient}=await db.from("customer_campaign_recipients").select("id,campaign_id,status").eq("provider","twilio").eq("provider_message_id",sid).maybeSingle();if(!recipient)return NextResponse.json({ok:true});
 const failed=["failed","undelivered"].includes(messageStatus),delivered=messageStatus==="delivered";
 await db.from("customer_campaign_recipients").update({...(failed?{status:"failed",error_message:`Twilio delivery ${messageStatus}${params.get("ErrorCode")?` (${params.get("ErrorCode")})`:""}`}:{status:delivered?"delivered":recipient.status}),...(delivered?{delivered_at:new Date().toISOString(),error_message:null}:{}),updated_at:new Date().toISOString()}).eq("id",recipient.id);
 await refreshCampaignCounts(recipient.campaign_id);return NextResponse.json({ok:true});
}
