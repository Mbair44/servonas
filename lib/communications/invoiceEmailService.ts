import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {formatCents} from "@/lib/financial/priceBook";
export type FinancialEmailEvent="invoice_sent"|"invoice_viewed"|"payment_link_sent"|"payment_succeeded"|"payment_failed"|"partial_payment"|"invoice_paid"|"invoice_overdue"|"refund_issued"|"receipt_sent";
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function sendInvoiceFinancialEmail(invoiceId:string,event:FinancialEmailEvent,options:{paymentId?:string;refundId?:string;publicUrl?:string}={}){
 const db=getSupabaseAdmin();if(!db)return {ok:false};
 const {data:i,error}=await db.from("invoices").select("id,business_id,invoice_number,currency,balance_due_cents,businesses(name),customers!invoices_customer_fk(first_name,last_name,email)").eq("id",invoiceId).maybeSingle();
 if(error||!i){console.error("Financial email invoice lookup failed",{invoiceId,event,code:error?.code});return {ok:false};}
 const business=Array.isArray(i.businesses)?i.businesses[0]:i.businesses,customer=Array.isArray(i.customers)?i.customers[0]:i.customers;
 if(!customer?.email)return {ok:true,skipped:true};
 const {data:payment}=options.paymentId?await db.from("payments").select("amount_cents,payment_method_type,paid_at,received_at,created_at").eq("id",options.paymentId).eq("business_id",i.business_id).maybeSingle():{data:null};
 const {data:refund}=options.refundId?await db.from("payment_refunds").select("amount_cents,reason,completed_at").eq("id",options.refundId).eq("business_id",i.business_id).maybeSingle():{data:null};
 let existingQuery=db.from("financial_notification_events").select("id,status").eq("invoice_id",invoiceId).eq("event_type",event);
 existingQuery=options.paymentId?existingQuery.eq("payment_id",options.paymentId):existingQuery.is("payment_id",null);
 existingQuery=options.refundId?existingQuery.eq("refund_id",options.refundId):existingQuery.is("refund_id",null);
 const {data:existing}=await existingQuery.maybeSingle();
 if(existing&&["sent","queued"].includes(existing.status))return {ok:true,duplicate:true};
 const labels:Record<FinancialEmailEvent,string>={invoice_sent:"Invoice sent",invoice_viewed:"Invoice viewed",payment_link_sent:"Payment link",payment_succeeded:"Payment received",payment_failed:"Payment failed",partial_payment:"Partial payment received",invoice_paid:"Invoice paid",invoice_overdue:"Invoice overdue",refund_issued:"Refund issued",receipt_sent:"Payment receipt"};
 const lines=[labels[event],`Business: ${business?.name||"Servonas"}`,`Customer: ${customer.first_name||""} ${customer.last_name||""}`.trim(),`Invoice: ${i.invoice_number}`,payment?`Payment date: ${payment.paid_at||payment.received_at||payment.created_at}`:null,payment?`Payment amount: ${formatCents(payment.amount_cents,i.currency)}`:null,payment?`Payment method: ${(payment.payment_method_type||"card").replaceAll("_"," ")}`:null,`Remaining balance: ${formatCents(i.balance_due_cents,i.currency)}`,refund?`Refund: ${formatCents(refund.amount_cents,i.currency)} — ${refund.reason}`:null,options.publicUrl?`Secure invoice link: ${options.publicUrl}`:null].filter(Boolean) as string[];
 const live=process.env.EMAIL_DELIVERY_MODE==="live",payload={business_id:i.business_id,invoice_id:invoiceId,payment_id:options.paymentId??null,refund_id:options.refundId??null,event_type:event,recipient_email:customer.email,status:live?"queued":"stubbed"};
 const saved=existing?await db.from("financial_notification_events").update(payload).eq("id",existing.id).select("id").single():await db.from("financial_notification_events").insert(payload).select("id").single();
 if(saved.error||!saved.data){console.error("Financial email audit failed",{invoiceId,event,code:saved.error?.code});return {ok:false};}
 if(!live)return {ok:true,stubbed:true};
 const key=process.env.RESEND_API_KEY,from=process.env.EMAIL_FROM;if(!key||!from){await db.from("financial_notification_events").update({status:"failed",error_message:"Email delivery is not configured."}).eq("id",saved.data.id);return {ok:false};}
 try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[customer.email],subject:`${labels[event]} — ${business?.name||"Servonas"} ${i.invoice_number}`,text:lines.join("\n\n"),html:`<div style="font-family:Arial,sans-serif;line-height:1.6">${lines.map(x=>`<p>${esc(x)}</p>`).join("")}</div>`})});const result=await response.json() as {id?:string;message?:string};if(!response.ok||!result.id)throw new Error(result.message||`Resend HTTP ${response.status}`);await db.from("financial_notification_events").update({status:"sent",provider_message_id:result.id,sent_at:new Date().toISOString()}).eq("id",saved.data.id);return {ok:true};}catch(e){const message=e instanceof Error?e.message:"Email failed";await db.from("financial_notification_events").update({status:"failed",error_message:message.slice(0,1000)}).eq("id",saved.data.id);console.error("Financial email delivery failed",{invoiceId,event,message});return {ok:false};}
}
