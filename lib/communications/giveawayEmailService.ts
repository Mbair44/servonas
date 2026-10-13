const esc=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
export async function sendGiveawayConfirmation(input:{businessId:string;entryId:string;email:string;businessName:string;replyTo:string|null;code:string;expiresAt:string|null;minimumSubtotalCents:number|null}){
 const key=process.env.RESEND_API_KEY?.trim(),from=process.env.EMAIL_FROM?.trim();if(!key||!from)return {ok:false,skipped:true};
 const minimum=input.minimumSubtotalCents==null?"":" Minimum rental subtotal: $"+(input.minimumSubtotalCents/100).toFixed(2)+".";
 const expires=input.expiresAt?` Expires ${new Date(input.expiresAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}.`:"";
 const text=`Thanks for entering ${input.businessName}'s giveaway. Your rental discount code is ${input.code}.${minimum}${expires}`;
 try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`giveaway-entry/${input.entryId}`},body:JSON.stringify({from:`${input.businessName} <${from.match(/<([^>]+)>/)?.[1]??from}>`,to:[input.email],...(input.replyTo?{reply_to:input.replyTo}:{}),subject:`Your ${input.businessName} giveaway entry`,text,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h1>You're entered!</h1><p>${esc(text)}</p><p><strong>Code: ${esc(input.code)}</strong></p></div>`})});return {ok:response.ok,skipped:false};}catch{return {ok:false,skipped:false};}
}
