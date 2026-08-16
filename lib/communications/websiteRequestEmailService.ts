import {rentalEmailDeliveryIsLive} from "../emailDeliveryMode.ts";

type WebsiteRequestNotification={
 businessId:string;
 requestId:string;
 businessName:string;
 recipient:string;
 customerName:string;
 customerPhone:string;
 customerEmail?:string|null;
 serviceName?:string|null;
 serviceAddress:string;
 description:string;
 preferredAt?:string|null;
};

type ResendResponse={id?:string;message?:string;name?:string;statusCode?:number};

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]!);
const safeBusinessName=(value:string)=>value.replace(/[\r\n<>]/g,"").trim()||"Service business";

export function websiteRequestNotificationContent(notification:WebsiteRequestNotification){
 const lines=[
  "A new website consultation request was received.",
  `Business: ${notification.businessName}`,
  `Customer: ${notification.customerName}`,
  `Phone: ${notification.customerPhone}`,
  notification.customerEmail?`Email: ${notification.customerEmail}`:null,
  notification.serviceName?`Service: ${notification.serviceName}`:null,
  `Service address: ${notification.serviceAddress}`,
  notification.preferredAt?`Preferred date or time: ${notification.preferredAt}`:null,
  "Message:",
  notification.description,
  "Open Servonas to view and follow up on this request.",
 ].filter((line):line is string=>Boolean(line));
 return {
  subject:`New consultation request from ${notification.customerName} — ${notification.businessName}`,
  text:lines.join("\n\n"),
  html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>New consultation request</h2>${lines.map(line=>`<p style="white-space:pre-wrap">${escapeHtml(line)}</p>`).join("")}</div>`,
 };
}

export async function sendWebsiteRequestBusinessNotification(notification:WebsiteRequestNotification){
 if(!rentalEmailDeliveryIsLive()){
  console.info("Website consultation notification email skipped",{businessId:notification.businessId,requestId:notification.requestId,reason:"email_delivery_not_live"});
  return {ok:false as const,error:"email_delivery_not_live" as const};
 }
 const apiKey=process.env.RESEND_API_KEY?.trim(),configuredFrom=process.env.EMAIL_FROM?.trim();
 if(!apiKey||!configuredFrom){
  console.error("Website consultation notification email failed",{businessId:notification.businessId,requestId:notification.requestId,provider:"resend",reason:"email_not_configured",missing:[!apiKey?"RESEND_API_KEY":null,!configuredFrom?"EMAIL_FROM":null].filter(Boolean)});
  return {ok:false as const,error:"email_not_configured" as const};
 }
 const fromAddress=configuredFrom.match(/<([^>]+)>/)?.[1]??configuredFrom;
 const content=websiteRequestNotificationContent(notification);
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":`website-request/${notification.requestId}`},body:JSON.stringify({from:`${safeBusinessName(notification.businessName)} <${fromAddress}>`,to:[notification.recipient],...(notification.customerEmail?{reply_to:notification.customerEmail}:{}),subject:content.subject,text:content.text,html:content.html})});
  const result=await response.json().catch(()=>null) as ResendResponse|null;
  if(!response.ok||!result?.id){
   console.error("Website consultation notification email failed",{businessId:notification.businessId,requestId:notification.requestId,provider:"resend",httpStatus:response.status,providerStatus:result?.statusCode,providerError:result?.name,reason:"provider_rejected"});
   return {ok:false as const,error:"provider_rejected" as const};
  }
  console.info("Website consultation notification email sent",{businessId:notification.businessId,requestId:notification.requestId,provider:"resend",messageId:result.id});
  return {ok:true as const,messageId:result.id};
 }catch(error){
  console.error("Website consultation notification email failed",{businessId:notification.businessId,requestId:notification.requestId,provider:"resend",reason:"request_failed",errorName:error instanceof Error?error.name:"unknown"});
  return {ok:false as const,error:"request_failed" as const};
 }
}
