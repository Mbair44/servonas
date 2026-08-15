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

export function domainPurchaseEmailContent(notification:DomainPurchaseNotification,appUrl?:string){
 const adminUrl=appUrl?`${appUrl.replace(/\/$/,"")}/app/admin/domains`:null;
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

export async function sendDomainPurchaseNotification(notification:DomainPurchaseNotification){
 const recipient=process.env.ADMIN_EMAIL?.trim(),apiKey=process.env.RESEND_API_KEY?.trim(),from=process.env.EMAIL_FROM?.trim();
 if(process.env.EMAIL_DELIVERY_MODE!=="live")return{ok:false as const,error:"email_delivery_not_live"};
 if(!recipient||!apiKey||!from){console.error("Domain purchase owner notification is not configured",{businessId:notification.businessId,missing:[!recipient?"ADMIN_EMAIL":null,!apiKey?"RESEND_API_KEY":null,!from?"EMAIL_FROM":null].filter(Boolean)});return{ok:false as const,error:"email_not_configured"};}
 const content=domainPurchaseEmailContent(notification,process.env.NEXT_PUBLIC_APP_URL);
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":`domain-purchase/${notification.providerOrderId}`},body:JSON.stringify({from,to:[recipient],subject:content.subject,text:content.text,html:content.html})});
  const result=await response.json() as ResendResponse;
  if(!response.ok||!result.id){console.error("Domain purchase owner notification failed",{businessId:notification.businessId,httpStatus:response.status,providerStatus:result.statusCode,providerError:result.name});return{ok:false as const,error:"provider_rejected"};}
  console.info("Domain purchase owner notification sent",{businessId:notification.businessId,messageId:result.id});return{ok:true as const,messageId:result.id};
 }catch(error){console.error("Domain purchase owner notification request failed",{businessId:notification.businessId,errorName:error instanceof Error?error.name:"unknown"});return{ok:false as const,error:"request_failed"};}
}
