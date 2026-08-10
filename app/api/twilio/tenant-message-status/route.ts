import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {refreshCampaignCounts} from "@/lib/communications/customerCampaignDelivery";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";

export async function POST(request:Request){
 const raw=await request.text(),params=new URLSearchParams(raw),accountSid=params.get("AccountSid")??"",signature=request.headers.get("x-twilio-signature")??"",db=getSupabaseAdmin();
 if(!db||!/^AC[0-9A-Za-z]{32}$/.test(accountSid))return NextResponse.json({error:"Invalid signature"},{status:403});
 const {data:account}=await db.from("business_twilio_accounts").select("business_id,twilio_subaccount_sid").eq("twilio_subaccount_sid",accountSid).eq("provisioning_status","active").maybeSingle();
 if(!account)return NextResponse.json({error:"Invalid signature"},{status:403});
 const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:account.business_id,subaccountSid:accountSid}),url=twilioWebhookUrl(request,"TWILIO_TENANT_MESSAGE_STATUS_WEBHOOK_URL");
 if(!token||!validTwilioSignature(url,params,signature,token))return NextResponse.json({error:"Invalid signature"},{status:403});
 const messageSid=params.get("MessageSid"),messageStatus=params.get("MessageStatus")??"";if(!messageSid)return NextResponse.json({ok:true});
 const {data:recipient}=await db.from("customer_campaign_recipients").select("id,campaign_id,status").eq("business_id",account.business_id).eq("provider","twilio").eq("provider_message_id",messageSid).maybeSingle();if(!recipient)return NextResponse.json({ok:true});
 const failed=["failed","undelivered"].includes(messageStatus),delivered=messageStatus==="delivered",now=new Date().toISOString();
 await db.from("customer_campaign_recipients").update({...(failed?{status:"failed",error_message:`Twilio delivery ${messageStatus}${params.get("ErrorCode")?` (${params.get("ErrorCode")})`:""}`}:{status:delivered?"delivered":recipient.status}),...(delivered?{delivered_at:now,error_message:null}:{}),updated_at:now}).eq("id",recipient.id);
 await refreshCampaignCounts(recipient.campaign_id);return NextResponse.json({ok:true});
}
