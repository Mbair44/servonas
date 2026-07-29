import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {generatePublicDocumentToken,publicDocumentTokenHash} from "@/lib/publicDocumentToken";
import {sendInvoiceFinancialEmail} from "@/lib/communications/invoiceEmailService";
import {stripeClient,stripeProviderError} from "@/lib/stripeConnect";

type CompletionResult={
  ok:boolean;
  invoiceId?:string;
  action?:"draft"|"sent"|"paid"|"payment_failed";
  error?:string;
};

export async function processCompletedJobBilling(jobId:string):Promise<CompletionResult>{
 const db=getSupabaseAdmin();
 if(!db)return{ok:false,error:"Supabase is unavailable."};
 const {data:created,error:createError}=await db.rpc("create_completed_job_invoice",{p_job_id:jobId});
 if(createError){
  console.error("Completed-job billing invoice creation failed",{jobId,code:createError.code,message:createError.message});
  return{ok:false,error:createError.code};
 }
 const result=Array.isArray(created)?created[0]:created;
 if(!result?.invoice_id)return{ok:false,error:"invoice_not_created"};
 const invoiceId=String(result.invoice_id);
 const {data:invoice,error:invoiceError}=await db.from("invoices")
  .select("id,business_id,customer_id,job_id,status,balance_due_cents,currency,billing_method_snapshot")
  .eq("id",invoiceId).maybeSingle();
 if(invoiceError||!invoice){
  console.error("Completed-job billing invoice lookup failed",{jobId,invoiceId,code:invoiceError?.code});
  return{ok:false,invoiceId,error:"invoice_lookup_failed"};
 }
 const billingMethod=invoice.billing_method_snapshot??result.billing_method;
 if(billingMethod==="manual_billing")return{ok:true,invoiceId,action:"draft"};

 if(billingMethod==="invoice_after_completion"){
  if(!result.auto_send)return{ok:true,invoiceId,action:"draft"};
  const token=generatePublicDocumentToken(),hash=await publicDocumentTokenHash(token);
  const {error}=await db.from("invoices").update({
   status:"sent",sent_at:new Date().toISOString(),public_token_hash:hash,
   public_token_expires_at:new Date(Date.now()+365*86400000).toISOString(),public_token_revoked_at:null,
  }).eq("id",invoiceId).eq("status","draft");
  if(error){
   console.error("Automatic recurring invoice finalization failed",{jobId,invoiceId,code:error.code});
   return{ok:false,invoiceId,error:error.code};
  }
  await db.from("invoice_events").insert({business_id:invoice.business_id,invoice_id:invoiceId,event_type:"sent",metadata:{automatic:true,source:"job_completion"}});
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000").replace(/\/$/,"");
  const email=await sendInvoiceFinancialEmail(invoiceId,"invoice_sent",{publicUrl:`${origin}/invoice/${token}`});
  if(!email.ok)console.error("Automatic recurring invoice email failed",{jobId,invoiceId});
  return{ok:true,invoiceId,action:"sent"};
 }

 const [{data:profile},{data:account}]=await Promise.all([
  db.from("customer_billing_profiles").select("provider_customer_id,default_payment_method_id,autopay_enabled")
   .eq("business_id",invoice.business_id).eq("customer_id",invoice.customer_id).maybeSingle(),
  db.from("business_payment_accounts").select("provider_account_id,charges_enabled,onboarding_status")
   .eq("business_id",invoice.business_id).eq("provider","stripe").maybeSingle(),
 ]);
 const {data:method}=profile?.default_payment_method_id?await db.from("customer_payment_methods")
  .select("id,provider_payment_method_id").eq("business_id",invoice.business_id)
  .eq("id",profile.default_payment_method_id).eq("status","active").maybeSingle():{data:null};
 const attemptKey=`completed-job:${jobId}:autopay:1`;
 const {data:existingAttempt}=await db.from("payment_attempts").select("id,status,payment_id")
  .eq("business_id",invoice.business_id).eq("idempotency_key",attemptKey).maybeSingle();
 if(existingAttempt?.status==="succeeded")return{ok:true,invoiceId,action:"paid"};
 if(existingAttempt?.status==="pending"&&existingAttempt.payment_id)return{ok:true,invoiceId,action:"draft"};
 const {data:newAttempt,error:attemptError}=existingAttempt?{data:existingAttempt,error:null}:await db.from("payment_attempts").insert({
  business_id:invoice.business_id,invoice_id:invoiceId,payment_method_id:method?.id??null,
  attempt_number:1,idempotency_key:attemptKey,status:"pending",
 }).select("id,status,payment_id").single();
 const attempt=newAttempt;
 if(attemptError||!attempt){
  console.error("Automatic recurring payment attempt creation failed",{jobId,invoiceId,code:attemptError?.code});
  return{ok:false,invoiceId,error:attemptError?.code??"payment_attempt_failed"};
 }
 if(!profile?.autopay_enabled||!profile.provider_customer_id||!method||!account?.provider_account_id||!account.charges_enabled){
  const reason=!profile?.autopay_enabled?"autopay_not_enabled":!method?"payment_method_missing":"stripe_account_unavailable";
  if(attempt?.id)await db.from("payment_attempts").update({status:"failed",failure_code:reason,failure_reason:"Automatic payment could not start because billing setup is incomplete.",completed_at:new Date().toISOString()}).eq("id",attempt.id);
  await db.from("billing_audit_events").insert({business_id:invoice.business_id,customer_id:invoice.customer_id,job_id:invoice.job_id,invoice_id:invoiceId,event_type:"automatic_payment_failed",metadata:{reason,office_attention_required:true}});
  return{ok:true,invoiceId,action:"payment_failed"};
 }
 await db.from("invoices").update({status:"ready",auto_charge_attempted_at:new Date().toISOString()})
  .eq("id",invoiceId).in("status",["draft","ready"]);
 const paymentKey=crypto.randomUUID();
 const {data:payment,error:paymentError}=await db.from("payments").insert({
  business_id:invoice.business_id,customer_id:invoice.customer_id,invoice_id:invoiceId,job_id:invoice.job_id,
  provider:"stripe",provider_account_id:account.provider_account_id,provider_customer_id:profile.provider_customer_id,
  amount_cents:invoice.balance_due_cents,status:"pending",idempotency_key:paymentKey,payment_method_type:"card",
  currency:invoice.currency,net_amount_cents:0,
 }).select("id").single();
 if(paymentError||!payment){
  console.error("Automatic recurring payment ledger creation failed",{jobId,invoiceId,code:paymentError?.code});
  return{ok:false,invoiceId,error:paymentError?.code??"payment_ledger_failed"};
 }
 try{
  const intent=await stripeClient().paymentIntents.create({
   amount:Number(invoice.balance_due_cents),currency:invoice.currency.toLowerCase(),
   customer:profile.provider_customer_id,payment_method:method.provider_payment_method_id,
   confirm:true,off_session:true,
   metadata:{servonas_kind:"recurring_visit_autopay",business_id:invoice.business_id,invoice_id:invoiceId,payment_id:payment.id,job_id:jobId},
  },{stripeAccount:account.provider_account_id,idempotencyKey:attemptKey});
  const status=intent.status==="succeeded"?"succeeded":intent.status==="canceled"?"canceled":intent.status==="processing"?"processing":"requires_action";
  await db.rpc("reconcile_invoice_online_payment",{
   p_business_id:invoice.business_id,p_payment_id:payment.id,p_status:status,
   p_payment_intent_id:intent.id,p_charge_id:null,p_payment_method_type:"card",p_receipt_url:null,
   p_failure_code:null,p_failure_message:null,p_occurred_at:new Date().toISOString(),
  });
  if(attempt?.id)await db.from("payment_attempts").update({
   payment_id:payment.id,provider_payment_intent_id:intent.id,status:status==="succeeded"?"succeeded":"pending",
   completed_at:status==="succeeded"?new Date().toISOString():null,
  }).eq("id",attempt.id);
  if(status==="succeeded"){
   await sendInvoiceFinancialEmail(invoiceId,"payment_succeeded",{paymentId:payment.id});
   await sendInvoiceFinancialEmail(invoiceId,"receipt_sent",{paymentId:payment.id});
   return{ok:true,invoiceId,action:"paid"};
  }
  return{ok:true,invoiceId,action:"payment_failed"};
 }catch(error){
  const detail=stripeProviderError(error),now=new Date().toISOString();
  await db.rpc("reconcile_invoice_online_payment",{
   p_business_id:invoice.business_id,p_payment_id:payment.id,p_status:"failed",
   p_payment_intent_id:null,p_charge_id:null,p_payment_method_type:"card",p_receipt_url:null,
   p_failure_code:detail.code,p_failure_message:detail.message,p_occurred_at:now,
  });
  if(attempt?.id)await db.from("payment_attempts").update({
   payment_id:payment.id,status:"failed",failure_code:detail.code,failure_reason:detail.message,completed_at:now,
  }).eq("id",attempt.id);
  await db.from("billing_audit_events").insert({business_id:invoice.business_id,customer_id:invoice.customer_id,job_id:invoice.job_id,invoice_id:invoiceId,payment_id:payment.id,event_type:"automatic_payment_failed",metadata:{reason:detail.message,office_attention_required:true}});
  console.error("Automatic recurring payment failed",{jobId,invoiceId,paymentId:payment.id,...detail});
  return{ok:true,invoiceId,action:"payment_failed"};
 }
}
