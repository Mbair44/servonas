import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const esc=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

export async function sendWebsiteLeadCaptureEmail(input:{
 businessId:string;
 customerId:string;
 customerEmail:string;
 businessName:string;
 businessReplyTo:string|null;
 subject:string;
 couponCode:string|null;
 offerLabel:string;
 successMessage:string;
 bookingUrl:string|null;
 expiresAt:string|null;
}){
 const db=getSupabaseAdmin();
 const apiKey=process.env.RESEND_API_KEY?.trim();
 const configuredFrom=process.env.EMAIL_FROM?.trim();
 if(!db||!apiKey||!configuredFrom)return {ok:false as const,error:"Email delivery is not configured."};
 const {data:campaign}=await db.from("customer_campaigns").insert({
  business_id:input.businessId,
  name:`Website discount lead ${input.customerEmail}`,
  channel:"email",
  subject:input.subject,
  body:`${input.successMessage}${input.couponCode?`\n\nUse code ${input.couponCode}.`:""}${input.bookingUrl?`\n\nBook now: ${input.bookingUrl}`:""}`,
  status:"sent",
 }).select("id").single();
 if(!campaign)return {ok:false as const,error:"Campaign tracking could not be prepared."};
 const {data:recipient}=await db.from("customer_campaign_recipients").insert({
  business_id:input.businessId,
  campaign_id:campaign.id,
  customer_id:input.customerId,
  recipient_address:input.customerEmail,
  status:"queued",
 }).select("id,tracking_token").single();
 if(!recipient)return {ok:false as const,error:"Campaign recipient tracking could not be prepared."};
 const origin=(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,"");
 const unsubscribeUrl=`${origin}/unsubscribe/${recipient.tracking_token}`;
 const sendingAddress=configuredFrom.match(/<\s*([^>]+)\s*>/)?.[1]?.trim()||configuredFrom;
 const from=`${input.businessName} <${sendingAddress}>`;
 const lines=[
  input.successMessage,
  `Offer: ${input.offerLabel}`,
  input.couponCode?`Coupon code: ${input.couponCode}`:"",
  input.expiresAt?`Offer expires: ${new Date(input.expiresAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`:"",
  input.bookingUrl?`Book now: ${input.bookingUrl}`:"",
  `Unsubscribe: ${unsubscribeUrl}`,
 ].filter(Boolean);
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[input.customerEmail],...(input.businessReplyTo?{reply_to:input.businessReplyTo}:{}),subject:input.subject,text:lines.join("\n\n"),html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><p>${esc(input.successMessage)}</p><p><strong>Offer:</strong> ${esc(input.offerLabel)}</p>${input.couponCode?`<p><strong>Coupon code:</strong> <code>${esc(input.couponCode)}</code></p>`:""}${input.expiresAt?`<p><strong>Offer expires:</strong> ${esc(new Date(input.expiresAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}))}</p>`:""}${input.bookingUrl?`<p><a href="${esc(input.bookingUrl)}">Book now</a></p>`:""}<p style="margin-top:28px;color:#667085;font-size:12px">Sent by ${esc(input.businessName)} using Servonas. <a href="${unsubscribeUrl}" style="color:#667085">Unsubscribe from campaign emails</a>.</p><img src="${origin}/api/campaigns/open/${recipient.tracking_token}" width="1" height="1" alt="" style="display:block;border:0"/></div>`,headers:{"List-Unsubscribe":`<${unsubscribeUrl}>`}})});
  const result=await response.json() as {id?:string;message?:string};
  if(!response.ok||!result.id)throw new Error(result.message||`Resend HTTP ${response.status}`);
  await db.from("customer_campaign_recipients").update({status:"sent",provider:"resend",provider_message_id:result.id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",recipient.id);
  return {ok:true as const};
 }catch(error){
  const message=error instanceof Error?error.message:"Email delivery failed.";
  await db.from("customer_campaign_recipients").update({status:"failed",error_message:message.slice(0,1000),updated_at:new Date().toISOString()}).eq("id",recipient.id);
  return {ok:false as const,error:message};
 }
}
