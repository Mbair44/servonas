import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {canSendExactChannel,ExactChannelConsentError} from "@/lib/communications/exactChannelConsent";
import {sendTenantTwilioMessage,TenantSmsError} from "@/lib/twilio/messageUsage";

type Result={ok:boolean;skipped?:boolean;duplicate?:boolean;error?:string};
const safeError=(error:unknown)=>error instanceof ExactChannelConsentError
 ? error.code==="consent_schema_unavailable"?"Campaign consent records are not ready. No message was sent.":"Campaign consent could not be verified. No message was sent."
 : error instanceof TenantSmsError&&error.messageSid?"Twilio accepted this message; delivery is being reconciled. Do not retry it."
 : error instanceof Error?error.message.slice(0,1000):"Campaign delivery failed.";
const personalize=(body:string,customer:{first_name:string|null;last_name:string|null;company_name:string|null},businessName:string)=>body.replaceAll("{first_name}",customer.first_name||customer.company_name||"there").replaceAll("{last_name}",customer.last_name||"").replaceAll("{customer_name}",customer.company_name||`${customer.first_name||""} ${customer.last_name||""}`.trim()||"there").replaceAll("{business_name}",businessName);

async function save(db:any,id:string,values:Record<string,unknown>){
 const {error}=await db.from("customer_campaign_recipients").update({...values,updated_at:new Date().toISOString()}).eq("id",id);
 if(error)throw new Error("Campaign delivery state could not be saved.");
}

/** Atomically claims a recipient before any provider request. */
async function claim(db:any,recipientId:string){
 const now=new Date().toISOString(),token=crypto.randomUUID();
 const {data,error}=await db.from("customer_campaign_recipients").update({status:"sending",send_claimed_at:now,send_attempt_token:token,updated_at:now}).eq("id",recipientId).eq("status","queued").is("provider_message_id",null).select("id").maybeSingle();
 if(error)throw new Error("Campaign recipient could not be claimed.");
 return Boolean(data);
}

export async function deliverCampaignRecipient(recipientId:string):Promise<Result>{
 const db=getSupabaseAdmin();if(!db)return{ok:false,error:"Campaign delivery storage is unavailable."};
 try{
  const {data:recipient,error}=await db.from("customer_campaign_recipients").select("id,business_id,campaign_id,customer_id,recipient_address,status,tracking_token,customer_campaigns(name,channel,subject,body,businesses(name,email)),customers(first_name,last_name,company_name,email,phone,phone_normalized)").eq("id",recipientId).maybeSingle();
  if(error||!recipient)return{ok:false,error:"Campaign recipient could not be loaded."};
  if(recipient.status!=="queued")return{ok:true,duplicate:true};
  if(!await claim(db,recipient.id))return{ok:true,duplicate:true};
  const campaign=Array.isArray(recipient.customer_campaigns)?recipient.customer_campaigns[0]:recipient.customer_campaigns,customer=Array.isArray(recipient.customers)?recipient.customers[0]:recipient.customers;
  const business=campaign&&(Array.isArray(campaign.businesses)?campaign.businesses[0]:campaign.businesses),businessName=business?.name||"Servonas customer",now=new Date().toISOString();
  if(!campaign||!customer){await save(db,recipient.id,{status:"failed",error_message:"Campaign recipient data is incomplete."});return{ok:false,error:"Campaign recipient data is incomplete."};}
  const body=personalize(String(campaign.body),customer,businessName);
  if(campaign.channel==="email"){
   if(!customer.email){await save(db,recipient.id,{status:"skipped",error_message:"Customer has no email address."});return{ok:true,skipped:true};}
   if(!await canSendExactChannel(db,{businessId:recipient.business_id,channel:"email",value:customer.email,purpose:"marketing"})){await save(db,recipient.id,{status:"skipped",error_message:"This email address is not eligible for campaign emails."});return{ok:true,skipped:true};}
   const key=process.env.RESEND_API_KEY?.trim(),from=process.env.EMAIL_FROM?.trim();
   if(!key||!from){await save(db,recipient.id,{status:"failed",error_message:"Campaign email delivery is not configured."});return{ok:false,error:"Campaign email delivery is not configured."};}
   const origin=(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,""),unsubscribeUrl=`${origin}/unsubscribe/${recipient.tracking_token}`;
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[customer.email],...(business?.email?{reply_to:business.email}:{}),subject:String(campaign.subject),text:`${body}\n\nUnsubscribe: ${unsubscribeUrl}`,headers:{"List-Unsubscribe":`<${unsubscribeUrl}>`}})});
   const result=await response.json() as {id?:string;message?:string};if(!response.ok||!result.id)throw new Error(result.message||"Campaign email provider rejected the message.");
   await save(db,recipient.id,{status:"sent",provider:"resend",provider_message_id:result.id,recipient_address:customer.email,sent_at:now,error_message:null});return{ok:true};
  }
  const phone=customer.phone_normalized||customer.phone;
  if(!phone){await save(db,recipient.id,{status:"skipped",error_message:"Customer has no valid phone number."});return{ok:true,skipped:true};}
  if(!await canSendExactChannel(db,{businessId:recipient.business_id,channel:"phone",value:phone,purpose:"marketing"})){await save(db,recipient.id,{status:"skipped",error_message:"Explicit marketing SMS consent is not recorded for this phone number."});return{ok:true,skipped:true};}
  if(process.env.SMS_DELIVERY_MODE!=="live"){await save(db,recipient.id,{status:"skipped",error_message:"SMS delivery is in stub mode; no message was sent."});return{ok:true,skipped:true};}
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,""),firstUrl=body.match(/https?:\/\/[^\s]+/)?.[0]??null,trackedBody=firstUrl?body.replace(firstUrl,`${origin}/c/${recipient.tracking_token}`):body,smsBody=`${trackedBody}\n\n${businessName}. Reply STOP to opt out.`.slice(0,1600);
  const sent=await sendTenantTwilioMessage({businessId:recipient.business_id,to:phone,body:smsBody,sourceType:"customer_campaign",sourceId:recipient.id,customerId:recipient.customer_id,purpose:"marketing"});
  await save(db,recipient.id,{status:"sent",provider:"twilio",provider_message_id:sent.sid,recipient_address:phone,tracked_url:firstUrl,sent_at:now,error_message:null});
  console.info("Campaign recipient accepted",{campaignId:recipient.campaign_id,recipientId:recipient.id,businessId:recipient.business_id,provider:"twilio"});
  return{ok:true};
 }catch(error){
  const message=safeError(error);console.error("Campaign recipient delivery failed",{recipientId,errorCode:error instanceof ExactChannelConsentError?error.code:error instanceof TenantSmsError?error.code:null});
  try{await save(db,recipientId,{status:"failed",error_message:message});}catch{console.error("Campaign recipient failure state could not be saved",{recipientId});}
  return{ok:false,error:message};
 }
}

export async function refreshCampaignCounts(campaignId:string){
 const db=getSupabaseAdmin();if(!db)return;
 const {data:rows,error}=await db.from("customer_campaign_recipients").select("status,sent_at,opened_at,clicked_at").eq("campaign_id",campaignId);
 if(error){console.error("Campaign counts could not be read",{campaignId,code:error.code});return;}
 const all=rows??[],count=(status:string)=>all.filter(row=>row.status===status).length,failed=count("failed"),skipped=count("skipped"),pending=count("queued")+count("sending"),sent=all.filter(row=>row.sent_at).length;
 const status=pending?"sending":sent&&!(failed||skipped)?"sent":sent||skipped?"partially_failed":"failed";
 const {error:updateError}=await db.from("customer_campaigns").update({recipient_count:all.length,sent_count:sent,delivered_count:count("delivered"),opened_count:all.filter(row=>row.opened_at).length,clicked_count:all.filter(row=>row.clicked_at).length,failed_count:failed,skipped_count:skipped,status,...(pending?{}:{completed_at:new Date().toISOString()}),updated_at:new Date().toISOString()}).eq("id",campaignId);
 if(updateError)console.error("Campaign counts could not be saved",{campaignId,code:updateError.code});
}
