import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeVoicePhone} from "@/lib/twilio/voice";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";
export const runtime="nodejs";
export async function POST(request:Request){
 const url=new URL(request.url),businessId=url.searchParams.get("business"),customerId=url.searchParams.get("customer"),to=normalizeVoicePhone(url.searchParams.get("to")??""),from=normalizeVoicePhone(url.searchParams.get("from")??"");
 if(!businessId||!customerId||!to||!from)return NextResponse.json({error:"Invalid call"},{status:400});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const params=new URLSearchParams(await request.text()),accountSid=params.get("AccountSid")??"";
 const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",businessId).eq("twilio_subaccount_sid",accountSid).maybeSingle();
 const token=account?.twilio_subaccount_sid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId,subaccountSid:account.twilio_subaccount_sid}):null;
 if(!token||!validTwilioSignature(twilioWebhookUrl(request,"TWILIO_VOICE_OUTBOUND_WEBHOOK_URL"),params,request.headers.get("x-twilio-signature")??"",token))return NextResponse.json({error:"Invalid signature"},{status:403});
 // This URL runs only after Twilio has called the selected staff phone. It deliberately
 // emits no greeting; the staff member immediately hears/bridges to the customer.
 return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${from}">${to}</Dial></Response>`,{headers:{"Content-Type":"text/xml"}});
}
