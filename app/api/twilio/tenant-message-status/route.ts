import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {refreshCampaignCounts} from "@/lib/communications/customerCampaignDelivery";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";
import {recordTenantStatusCallback} from "@/lib/twilio/messageUsage";

export async function POST(request:Request){
 const raw=await request.text(),params=new URLSearchParams(raw),accountSid=params.get("AccountSid")??"",signature=request.headers.get("x-twilio-signature")??"",db=getSupabaseAdmin();
 if(!db||!/^AC[0-9A-Za-z]{32}$/.test(accountSid))return NextResponse.json({error:"Invalid signature"},{status:403});
 const {data:account}=await db.from("business_twilio_accounts").select("business_id,twilio_subaccount_sid").eq("twilio_subaccount_sid",accountSid).eq("provisioning_status","active").maybeSingle();
 if(!account)return NextResponse.json({error:"Invalid signature"},{status:403});
 const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:account.business_id,subaccountSid:accountSid}),url=twilioWebhookUrl(request,"TWILIO_TENANT_MESSAGE_STATUS_WEBHOOK_URL");
 if(!token||!validTwilioSignature(url,params,signature,token))return NextResponse.json({error:"Invalid signature"},{status:403});
 const messageSid=params.get("MessageSid"),messageStatus=params.get("MessageStatus")??"";if(!messageSid)return NextResponse.json({ok:true});
 try{await recordTenantStatusCallback({businessId:account.business_id,accountSid,messageSid,status:messageStatus||"accepted",errorCode:params.get("ErrorCode"),errorMessage:params.get("ErrorMessage")?.slice(0,500)});}catch{return NextResponse.json({error:"Callback persistence failed"},{status:503});}
 // This optional bookkeeping must never interrupt established tenant message status callbacks.
 // Migration 003 is still required before code deployment; a missing queue is logged for rollback safety.
 try{const {recordSmartUpsellSmsDeliveryStatus}=await import("@/lib/smartUpsellSms");await recordSmartUpsellSmsDeliveryStatus(db,{businessId:account.business_id,messageSid,status:messageStatus||"accepted"});}catch(error){const code=typeof error==="object"&&error&&"code" in error?(error as {code?:string}).code:undefined;const message=error instanceof Error?error.message:"unknown";if(code==="42P01"||/smart_upsell_sms_deliveries/.test(message))console.warn("Smart Upsell queue is unavailable; continuing established callback processing.",{businessId:account.business_id});else console.error("Smart Upsell callback bookkeeping failed; continuing established callback processing.",{businessId:account.business_id,code,message});}
 const {data:recipient}=await db.from("customer_campaign_recipients").select("id,campaign_id,status").eq("business_id",account.business_id).eq("provider","twilio").eq("provider_message_id",messageSid).maybeSingle();if(!recipient)return NextResponse.json({ok:true});
 const failed=["failed","undelivered"].includes(messageStatus),delivered=messageStatus==="delivered",now=new Date().toISOString();
 await db.from("customer_campaign_recipients").update({...(failed?{status:"failed",error_message:`Twilio delivery ${messageStatus}${params.get("ErrorCode")?` (${params.get("ErrorCode")})`:""}`}:{status:delivered?"delivered":recipient.status}),...(delivered?{delivered_at:now,error_message:null}:{}),updated_at:now}).eq("id",recipient.id);
 await refreshCampaignCounts(recipient.campaign_id);return NextResponse.json({ok:true});
}
