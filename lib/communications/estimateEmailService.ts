import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatCents } from "@/lib/financial/priceBook";

export type EstimateCommunicationEvent =
  | "estimate_sent" | "estimate_viewed" | "estimate_accepted" | "estimate_declined"
  | "estimate_expiring" | "estimate_expired" | "estimate_follow_up";

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,(character)=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;",
}[character]!));

const copy:Record<EstimateCommunicationEvent,{subject:string;heading:string;message:string}> = {
  estimate_sent:{subject:"Estimate ready for review",heading:"Your estimate is ready",message:"Please review the estimate details and respond using the secure link below."},
  estimate_viewed:{subject:"Estimate viewed",heading:"Estimate review opened",message:"The estimate review page was opened successfully."},
  estimate_accepted:{subject:"Estimate accepted",heading:"Estimate accepted",message:"Thank you. Your estimate response has been recorded."},
  estimate_declined:{subject:"Estimate response received",heading:"Response received",message:"Your response to the estimate has been recorded."},
  estimate_expiring:{subject:"Estimate expiring soon",heading:"Your estimate expires soon",message:"Please review the estimate before its expiration date."},
  estimate_expired:{subject:"Estimate expired",heading:"Your estimate has expired",message:"Contact the business if you would like an updated estimate."},
  estimate_follow_up:{subject:"Estimate follow-up",heading:"A quick estimate follow-up",message:"The business is following up on your open estimate."},
};

async function queue(estimateId:string,event:EstimateCommunicationEvent,reviewToken?:string){
  const supabase=getSupabaseAdmin();
  if(!supabase)return {ok:false,error:"Estimate email service is unavailable."};
  const {data:estimate,error:lookupError}=await supabase.from("estimates")
    .select("id,business_id,estimate_number,title,version_number,currency,grand_total_cents,expiration_date,businesses(name),customers!estimates_customer_fk(first_name,email)")
    .eq("id",estimateId).maybeSingle();
  if(lookupError||!estimate){
    console.error("Estimate email lookup failed",{code:lookupError?.code,estimateId,event});
    return {ok:false,error:"Estimate details are unavailable."};
  }
  const business=Array.isArray(estimate.businesses)?estimate.businesses[0]:estimate.businesses;
  const customer=Array.isArray(estimate.customers)?estimate.customers[0]:estimate.customers;
  const {data:settings,error:settingsError}=await supabase.from("booking_settings")
    .select("brand_color,logo_url").eq("business_id",estimate.business_id).maybeSingle();
  if(settingsError)console.error("Estimate email branding lookup failed",{
    code:settingsError.code,estimateId,event,
  });
  if(!customer?.email)return {ok:true,skipped:true,reason:"customer_email_missing"};
  const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000").replace(/\/$/,"");
  const reviewUrl=reviewToken?`${siteUrl}/estimate/${reviewToken}`:null;
  const template=copy[event];
  const subject=`${template.subject} — ${business?.name||"Servonas"} ${estimate.estimate_number}`;
  const lines=[
    `Hi ${customer.first_name||"there"},`,template.message,
    `Estimate: ${estimate.estimate_number}`,
    `Total: ${formatCents(estimate.grand_total_cents,estimate.currency)}`,
    estimate.expiration_date?`Expiration: ${estimate.expiration_date}`:null,
    reviewUrl?`Secure review link: ${reviewUrl}`:null,
  ].filter(Boolean) as string[];
  const body=lines.join("\n\n");
  const recordedBody=reviewUrl?body.replace(reviewUrl,"[secure review link]"):body;
  const brand=settings?.brand_color||"#4f46e5";
  const logo=settings?.logo_url?`<img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(business?.name||"Business")} logo" style="max-width:170px;max-height:60px;object-fit:contain;margin-bottom:20px">`:"";
  const button=reviewUrl?`<p style="margin:26px 0"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:${escapeHtml(brand)};color:#fff;text-decoration:none;font-weight:700">Review estimate</a></p>`:"";
  const html=`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:auto">${logo}<h1 style="font-size:24px">${escapeHtml(template.heading)}</h1>${lines.map(line=>`<p>${escapeHtml(line)}</p>`).join("")}${button}<p style="font-size:12px;color:#64748b">Sent securely by Servonas.</p></div>`;
  const {data:existing}=await supabase.from("estimate_communication_events").select("id,status")
    .eq("estimate_id",estimateId).eq("channel","email").eq("event_type",event).eq("version_number",estimate.version_number).maybeSingle();
  if(existing&&["queued","sent"].includes(existing.status))return {ok:true,duplicate:true};
  const live=process.env.EMAIL_DELIVERY_MODE==="live";
  const payload={
    business_id:estimate.business_id,estimate_id:estimateId,channel:"email",event_type:event,
    version_number:estimate.version_number,status:live?"queued":"stubbed",
    recipient_email:customer.email,subject,message_body:recordedBody,error_message:null,
  };
  const eventResult=existing
    ?await supabase.from("estimate_communication_events").update(payload).eq("id",existing.id).select("id").single()
    :await supabase.from("estimate_communication_events").insert(payload).select("id").single();
  if(eventResult.error||!eventResult.data){
    console.error("Estimate email event recording failed",{code:eventResult.error?.code,estimateId,event});
    return {ok:false,error:"Estimate email status could not be recorded."};
  }
  if(!live)return {ok:true,stubbed:true};
  const apiKey=process.env.RESEND_API_KEY,from=process.env.EMAIL_FROM;
  if(!apiKey||!from){
    await supabase.from("estimate_communication_events").update({status:"failed",error_message:"Email delivery is not configured."}).eq("id",eventResult.data.id);
    console.error("Estimate email delivery unavailable",{reason:"resend_not_configured",estimateId,event,eventId:eventResult.data.id});
    return {ok:false,error:"Estimate email delivery is not configured."};
  }
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[customer.email],subject,html,text:body})});
    const provider=await response.json() as {id?:string;name?:string;message?:string;statusCode?:number};
    if(!response.ok||!provider.id){
      const safeError=provider.message||"Provider rejected the estimate email.";
      await supabase.from("estimate_communication_events").update({status:"failed",error_message:safeError}).eq("id",eventResult.data.id);
      console.error("Estimate email provider failure",{provider:"resend",httpStatus:response.status,providerStatus:provider.statusCode,providerError:provider.name,reason:safeError,estimateId,event,eventId:eventResult.data.id});
      return {ok:false,error:"Estimate email delivery failed."};
    }
    await supabase.from("estimate_communication_events").update({status:"sent",provider_message_id:provider.id,sent_at:new Date().toISOString(),error_message:null}).eq("id",eventResult.data.id);
    return {ok:true,messageId:provider.id};
  }catch(error){
    const message=error instanceof Error?error.message:"Email request failed.";
    await supabase.from("estimate_communication_events").update({status:"failed",error_message:message}).eq("id",eventResult.data.id);
    console.error("Estimate email request failed",{errorName:error instanceof Error?error.name:"unknown",errorMessage:message,estimateId,event,eventId:eventResult.data.id});
    return {ok:false,error:"Estimate email delivery failed."};
  }
}

async function safelyQueue(estimateId:string,event:EstimateCommunicationEvent,token?:string){
  try{return await queue(estimateId,event,token);}catch(error){
    console.error("Unexpected estimate email failure",{estimateId,event,errorName:error instanceof Error?error.name:"unknown"});
    return {ok:false,error:"Estimate email delivery failed unexpectedly."};
  }
}
export const EstimateEmailService={
  send:(id:string,token:string)=>safelyQueue(id,"estimate_sent",token),
  viewed:(id:string,token:string)=>safelyQueue(id,"estimate_viewed",token),
  accepted:(id:string,token:string)=>safelyQueue(id,"estimate_accepted",token),
  declined:(id:string,token:string)=>safelyQueue(id,"estimate_declined",token),
  expiring:(id:string,token:string)=>safelyQueue(id,"estimate_expiring",token),
  expired:(id:string,token?:string)=>safelyQueue(id,"estimate_expired",token),
  followUp:(id:string,token:string)=>safelyQueue(id,"estimate_follow_up",token),
};
