type DomainPurchaseNotification={
 businessId:string;
 businessName:string;
 businessSlug:string;
 businessEmail?:string|null;
 domain:string;
 providerOrderId:string;
 providerCost:number;
 customerRenewalPrice?:number|null;
 currency:string;
};

type ResendResponse={id?:string;message?:string;name?:string;statusCode?:number};
const esc=(value:string)=>value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]!);
const money=(value:number,currency:string)=>new Intl.NumberFormat("en-US",{style:"currency",currency}).format(value);
const appBaseUrl=(value?:string)=>value?.replace(/\/$/,"")??null;

export function domainPurchaseEmailContent(notification:DomainPurchaseNotification,appUrl?:string){
 const adminUrl=appBaseUrl(appUrl)?`${appBaseUrl(appUrl)}/app/admin/domains`:null;
 const lines=[
  "A customer registered a domain through the Servonas Vercel account.",
  `Business: ${notification.businessName}`,
  `Domain: ${notification.domain}`,
  notification.businessEmail?`Business email: ${notification.businessEmail}`:null,
  `Vercel cost: ${money(notification.providerCost,notification.currency)}`,
  notification.customerRenewalPrice!=null?`Customer renewal estimate: ${money(notification.customerRenewalPrice,notification.currency)}/year`:null,
  `Vercel order: ${notification.providerOrderId}`,
  `Business ID: ${notification.businessId}`,
  adminUrl?`Review domain: ${adminUrl}`:null,
 ].filter(Boolean) as string[];
 return{subject:`Domain purchased: ${notification.domain} — ${notification.businessName}`,text:lines.join("\n\n"),html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Domain purchased</h2>${lines.map(line=>`<p>${esc(line)}</p>`).join("")}</div>`};
}

export function customerDomainPurchaseEmailContent(notification:DomainPurchaseNotification,appUrl?:string){
 const businessUrl=appBaseUrl(appUrl)?`${appBaseUrl(appUrl)}/app/${notification.businessSlug}/settings/website`:null;
 const lines=[
  `Servonas registered ${notification.domain} for ${notification.businessName}.`,
  "Your website domain order is in progress and Servonas is connecting it now.",
  notification.customerRenewalPrice!=null?`Estimated renewal price: ${money(notification.customerRenewalPrice,notification.currency)}/year after the included first year.`:"Your first year is included with Servonas.",
  "You may also receive a confirmation or compliance email from Vercel or the registrar that processes the registration.",
  businessUrl?`Track setup: ${businessUrl}`:null,
 ].filter(Boolean) as string[];
 return{subject:`Your domain is being connected: ${notification.domain}`,text:lines.join("\n\n"),html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Your domain is being connected</h2>${lines.map(line=>`<p>${esc(line)}</p>`).join("")}</div>`};
}

async function postEmail(input:{apiKey:string;from:string;to:string[];subject:string;text:string;html:string;idempotencyKey:string}){
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${input.apiKey}`,"Content-Type":"application/json","Idempotency-Key":input.idempotencyKey},body:JSON.stringify({from:input.from,to:input.to,subject:input.subject,text:input.text,html:input.html})});
 const result=await response.json() as ResendResponse;
 if(!response.ok||!result.id)return {ok:false as const,httpStatus:response.status,result};
 return {ok:true as const,messageId:result.id};
}

export async function sendDomainPurchaseNotification(notification:DomainPurchaseNotification){
 const recipient=process.env.ADMIN_EMAIL?.trim(),apiKey=process.env.RESEND_API_KEY?.trim(),from=process.env.EMAIL_FROM?.trim();
 if(process.env.EMAIL_DELIVERY_MODE!=="live")return{ok:false as const,error:"email_delivery_not_live"};
 if(!recipient||!apiKey||!from){console.error("Domain purchase owner notification is not configured",{businessId:notification.businessId,missing:[!recipient?"ADMIN_EMAIL":null,!apiKey?"RESEND_API_KEY":null,!from?"EMAIL_FROM":null].filter(Boolean)});return{ok:false as const,error:"email_not_configured"};}
 const content=domainPurchaseEmailContent(notification,process.env.NEXT_PUBLIC_APP_URL);
 try{
  const ownerDelivery=await postEmail({apiKey,from,to:[recipient],subject:content.subject,text:content.text,html:content.html,idempotencyKey:`domain-purchase/${notification.providerOrderId}`});
  if(!ownerDelivery.ok){console.error("Domain purchase owner notification failed",{businessId:notification.businessId,httpStatus:ownerDelivery.httpStatus,providerStatus:ownerDelivery.result.statusCode,providerError:ownerDelivery.result.name});return{ok:false as const,error:"provider_rejected"};}
  if(notification.businessEmail?.trim()){
   const customerContent=customerDomainPurchaseEmailContent(notification,process.env.NEXT_PUBLIC_APP_URL);
   const customerDelivery=await postEmail({apiKey,from,to:[notification.businessEmail.trim()],subject:customerContent.subject,text:customerContent.text,html:customerContent.html,idempotencyKey:`domain-purchase-customer/${notification.providerOrderId}`});
   if(!customerDelivery.ok)console.error("Domain purchase customer notification failed",{businessId:notification.businessId,httpStatus:customerDelivery.httpStatus,providerStatus:customerDelivery.result.statusCode,providerError:customerDelivery.result.name});
   else console.info("Domain purchase customer notification sent",{businessId:notification.businessId,messageId:customerDelivery.messageId});
  }
  console.info("Domain purchase owner notification sent",{businessId:notification.businessId,messageId:ownerDelivery.messageId});return{ok:true as const,messageId:ownerDelivery.messageId};
 }catch(error){console.error("Domain purchase owner notification request failed",{businessId:notification.businessId,errorName:error instanceof Error?error.name:"unknown"});return{ok:false as const,error:"request_failed"};}
}
