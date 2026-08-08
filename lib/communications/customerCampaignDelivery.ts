import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getTwilioCredentials} from "@/lib/communications/twilioCredentials";

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]!));
const personalize=(body:string,customer:{first_name:string|null;last_name:string|null;company_name:string|null},businessName:string)=>body
 .replaceAll("{first_name}",customer.first_name||customer.company_name||"there")
 .replaceAll("{last_name}",customer.last_name||"")
 .replaceAll("{customer_name}",customer.company_name||`${customer.first_name||""} ${customer.last_name||""}`.trim()||"there")
 .replaceAll("{business_name}",businessName);

export async function deliverCampaignRecipient(recipientId:string){
 const db=getSupabaseAdmin();if(!db)return{ok:false,error:"Supabase is unavailable."};
 const {data:recipient,error}=await db.from("customer_campaign_recipients").select("id,business_id,campaign_id,customer_id,recipient_address,status,tracking_token,customer_campaigns(name,channel,subject,body,businesses(name)),customers(first_name,last_name,company_name,email,phone,phone_normalized,sms_consent_status)").eq("id",recipientId).maybeSingle();
 if(error||!recipient)return{ok:false,error:error?.message||"Recipient not found."};
 if(recipient.status!=="queued")return{ok:true,duplicate:true};
 const campaign=Array.isArray(recipient.customer_campaigns)?recipient.customer_campaigns[0]:recipient.customer_campaigns,customer=Array.isArray(recipient.customers)?recipient.customers[0]:recipient.customers;
 const business=campaign&&(Array.isArray(campaign.businesses)?campaign.businesses[0]:campaign.businesses),businessName=business?.name||"Servonas customer";
 if(!campaign||!customer)return{ok:false,error:"Campaign recipient data is incomplete."};
 const body=personalize(String(campaign.body),customer,businessName),now=new Date().toISOString();
 if(campaign.channel==="email"){
  if(!customer.email){await db.from("customer_campaign_recipients").update({status:"skipped",error_message:"Customer has no email address.",updated_at:now}).eq("id",recipient.id);return{ok:true,skipped:true};}
  const key=process.env.RESEND_API_KEY?.trim(),configuredFrom=process.env.EMAIL_FROM?.trim();
  if(!key||!configuredFrom){await db.from("customer_campaign_recipients").update({status:"failed",error_message:"Resend is not configured.",updated_at:now}).eq("id",recipient.id);return{ok:false,error:"Resend is not configured."};}
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,"");
  const firstUrl=body.match(/https?:\/\/[^\s<]+/)?.[0]??null,trackedUrl=firstUrl?`${origin}/c/${recipient.tracking_token}`:null;
  const linked=esc(body).replace(/https?:\/\/[^\s&lt;]+/,url=>`<a href="${esc(trackedUrl||url)}">${esc(url)}</a>`).replaceAll("\n","<br/>");
  const html=`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><p>${linked}</p><p style="color:#667085;font-size:12px">Sent by ${esc(businessName)} using Servonas.</p><img src="${origin}/api/campaigns/open/${recipient.tracking_token}" width="1" height="1" alt="" style="display:block;border:0"/></div>`;
  const from=configuredFrom.includes("<")?configuredFrom:`${businessName} <${configuredFrom}>`;
  try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[customer.email],subject:String(campaign.subject),text:body,html})});const result=await response.json() as {id?:string;message?:string};if(!response.ok||!result.id)throw new Error(result.message||`Resend HTTP ${response.status}`);await db.from("customer_campaign_recipients").update({status:"sent",provider:"resend",provider_message_id:result.id,recipient_address:customer.email,tracked_url:firstUrl,sent_at:now,error_message:null,updated_at:now}).eq("id",recipient.id).eq("status","queued");return{ok:true};}catch(caught){const message=caught instanceof Error?caught.message:"Email delivery failed.";await db.from("customer_campaign_recipients").update({status:"failed",error_message:message.slice(0,1000),updated_at:now}).eq("id",recipient.id);return{ok:false,error:message};}
 }
 if(customer.sms_consent_status!=="express"){
  const reason=customer.sms_consent_status==="opted_out"?"Customer opted out of SMS.":"Explicit marketing SMS consent is not recorded.";
  await db.from("customer_campaign_recipients").update({status:"skipped",error_message:reason,updated_at:now}).eq("id",recipient.id);return{ok:true,skipped:true};
 }
 const phone=customer.phone_normalized||customer.phone;if(!phone){await db.from("customer_campaign_recipients").update({status:"skipped",error_message:"Customer has no valid phone number.",updated_at:now}).eq("id",recipient.id);return{ok:true,skipped:true};}
 const twilio=getTwilioCredentials();if(!twilio.configured){await db.from("customer_campaign_recipients").update({status:"failed",error_message:"Twilio is not configured.",updated_at:now}).eq("id",recipient.id);return{ok:false,error:"Twilio is not configured."};}
 if(process.env.SMS_DELIVERY_MODE!=="live"){await db.from("customer_campaign_recipients").update({status:"skipped",error_message:"SMS delivery is in stub mode; no message was sent.",updated_at:now}).eq("id",recipient.id);return{ok:true,skipped:true};}
 const origin=(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,"");const firstUrl=body.match(/https?:\/\/[^\s]+/)?.[0]??null;
 const trackedBody=firstUrl?body.replace(firstUrl,`${origin}/c/${recipient.tracking_token}`):body;
 const smsBody=`${trackedBody}\n\n${businessName}. Reply STOP to opt out.`.slice(0,1600);
 try{const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${twilio.username}:${twilio.password}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({To:phone,From:twilio.from!,Body:smsBody,StatusCallback:`${origin}/api/twilio/campaign-status`})});const result=await response.json() as {sid?:string;message?:string};if(!response.ok||!result.sid)throw new Error(result.message||"Twilio rejected the message.");await db.from("customer_campaign_recipients").update({status:"sent",provider:"twilio",provider_message_id:result.sid,recipient_address:phone,tracked_url:firstUrl,sent_at:now,error_message:null,updated_at:now}).eq("id",recipient.id).eq("status","queued");return{ok:true};}catch(caught){const message=caught instanceof Error?caught.message:"SMS delivery failed.";await db.from("customer_campaign_recipients").update({status:"failed",error_message:message.slice(0,1000),updated_at:now}).eq("id",recipient.id);return{ok:false,error:message};}
}

export async function refreshCampaignCounts(campaignId:string){
 const db=getSupabaseAdmin();if(!db)return;
 const {data:rows}=await db.from("customer_campaign_recipients").select("status,opened_at,clicked_at").eq("campaign_id",campaignId);
 const all=rows??[],count=(status:string)=>all.filter(row=>row.status===status).length,failed=count("failed"),skipped=count("skipped"),queued=count("queued");
 await db.from("customer_campaigns").update({recipient_count:all.length,sent_count:all.filter(row=>["sent","delivered"].includes(row.status)).length,delivered_count:count("delivered"),opened_count:all.filter(row=>row.opened_at).length,clicked_count:all.filter(row=>row.clicked_at).length,failed_count:failed,skipped_count:skipped,status:queued?"sending":failed||skipped?"partially_failed":"sent",...(queued?{}:{completed_at:new Date().toISOString()}),updated_at:new Date().toISOString()}).eq("id",campaignId);
}
