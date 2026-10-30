import {rentalEmailDeliveryIsLive} from "../emailDeliveryMode.ts";

type InboundSmsEmailAlert={
 businessId:string;
 businessName:string;
 recipient:string;
 messageId:string;
 customerId:string;
 customerName:string;
 fromPhone:string;
 body:string;
 inboxUrl:string;
};

type ResendResponse={id?:string;message?:string;name?:string;statusCode?:number};

const escapeHtml=(value:string)=>value.replace(/[&<>\"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]!);
const safeBusinessName=(value:string)=>value.replace(/[\r\n<>]/g,"").trim()||"Service business";
const preview=(value:string)=>value.replace(/\s+/g," ").trim().slice(0,1200);

export function inboundSmsEmailAlertContent(alert:InboundSmsEmailAlert){
 const message=preview(alert.body);
 const lines=[
  "A customer sent a new text message.",
  `Customer: ${alert.customerName}`,
  `Phone: ${alert.fromPhone}`,
  "Message:",
  message,
  `Open conversation: ${alert.inboxUrl}`,
 ];
 return {
  subject:`New text from ${alert.customerName} — ${alert.businessName}`,
  text:lines.join("\n\n"),
  html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>New customer text</h2>${lines.slice(0,-1).map(line=>`<p style="white-space:pre-wrap">${escapeHtml(line)}</p>`).join("")}<p><a href="${escapeHtml(alert.inboxUrl)}">Open this conversation in Servonas</a></p></div>`,
 };
}

export async function sendInboundSmsEmailAlert(alert:InboundSmsEmailAlert){
 if(!rentalEmailDeliveryIsLive())return {ok:false as const,error:"email_delivery_not_live" as const};
 const apiKey=process.env.RESEND_API_KEY?.trim(),configuredFrom=process.env.EMAIL_FROM?.trim();
 if(!apiKey||!configuredFrom){
  console.error("Inbound SMS email alert is not configured",{businessId:alert.businessId,missing:[!apiKey?"RESEND_API_KEY":null,!configuredFrom?"EMAIL_FROM":null].filter(Boolean)});
  return {ok:false as const,error:"email_not_configured" as const};
 }
 const fromAddress=configuredFrom.match(/<([^>]+)>/)?.[1]??configuredFrom;
 const content=inboundSmsEmailAlertContent(alert);
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":`inbound-sms/${alert.messageId}`},body:JSON.stringify({from:`${safeBusinessName(alert.businessName)} <${fromAddress}>`,to:[alert.recipient],subject:content.subject,text:content.text,html:content.html})});
  const result=await response.json().catch(()=>null) as ResendResponse|null;
  if(!response.ok||!result?.id){
   console.error("Inbound SMS email alert failed",{businessId:alert.businessId,messageId:alert.messageId,provider:"resend",httpStatus:response.status,providerStatus:result?.statusCode,providerError:result?.name});
   return {ok:false as const,error:"provider_rejected" as const};
  }
  console.info("Inbound SMS email alert sent",{businessId:alert.businessId,messageId:alert.messageId,provider:"resend",providerMessageId:result.id});
  return {ok:true as const,messageId:result.id};
 }catch(error){
  console.error("Inbound SMS email alert failed",{businessId:alert.businessId,messageId:alert.messageId,provider:"resend",reason:"request_failed",errorName:error instanceof Error?error.name:"unknown"});
  return {ok:false as const,error:"request_failed" as const};
 }
}
