"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { canManageCustomers } from "@/lib/access";
import { calculateFinancialDocument, type Discount } from "@/lib/financial/calculations";
import { parseCurrencyToCents } from "@/lib/financial/priceBook";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
import { requireWorkspace } from "@/lib/workspace";
import { generatePublicDocumentToken,publicDocumentTokenHash } from "@/lib/publicDocumentToken";
import { stripeClient,stripeProviderError } from "@/lib/stripeConnect";
import type { EstimateFeeDraft, EstimateLineDraft } from "../estimates/actions";

export type InvoiceActionState={error?:string;fieldErrors?:Record<string,string>;values?:Record<string,string>};
const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const valuesFrom=(data:FormData)=>Object.fromEntries([...data.entries()].filter(([,value])=>typeof value==="string")) as Record<string,string>;
const safeJson=<T,>(value:string,fallback:T):T=>{try{return JSON.parse(value) as T;}catch{return fallback;}};
const path=(slug:string,id:string,kind:"success"|"error",message:string)=>`/app/${slug}/invoices/${id}?${kind}=${encodeURIComponent(message)}`;

function discount(type:string,raw:string):Discount|null{
  if(type==="none")return {type:"none",value:0};
  if(type==="fixed"){const value=parseCurrencyToCents(raw);return value===null?null:{type:"fixed",value};}
  const value=Number(raw);
  return Number.isFinite(value)&&value>=0&&value<=100?{type:"percentage",value:Math.round(value*100)}:null;
}

async function prepare(data:FormData,context:Awaited<ReturnType<typeof requireWorkspace>>){
  const values=valuesFrom(data),errors:Record<string,string>={};
  const lines=safeJson<EstimateLineDraft[]>(text(data,"linesJson"),[]);
  const fees=safeJson<EstimateFeeDraft[]>(text(data,"feesJson"),[]);
  const customerId=text(data,"customerId"),locationId=text(data,"serviceLocationId")||null,jobId=text(data,"jobId")||null;
  const title=text(data,"title");
  if(!customerId)errors.customerId="Choose a customer.";
  if(!title)errors.title="Enter an invoice title.";
  if(!lines.length)errors.lines="Add at least one line item.";
  const [{data:customer},{data:location},{data:job}]=await Promise.all([
    customerId?context.supabase.from("customers").select("id").eq("id",customerId).eq("business_id",context.business.id).eq("is_deleted",false).maybeSingle():Promise.resolve({data:null}),
    locationId?context.supabase.from("service_locations").select("id,customer_id").eq("id",locationId).eq("business_id",context.business.id).eq("is_deleted",false).maybeSingle():Promise.resolve({data:null}),
    jobId?context.supabase.from("jobs").select("id,customer_id").eq("id",jobId).eq("business_id",context.business.id).eq("is_deleted",false).maybeSingle():Promise.resolve({data:null}),
  ]);
  if(customerId&&!customer)errors.customerId="Customer does not belong to this business.";
  if(locationId&&(!location||location.customer_id!==customerId))errors.serviceLocationId="Location does not belong to this customer.";
  if(jobId&&(!job||job.customer_id!==customerId))errors.jobId="Job does not belong to this customer.";
  const lineInputs=lines.map((line,index)=>{
    const price=parseCurrencyToCents(line.unitPrice),cost=parseCurrencyToCents(line.internalCost||"0");
    const lineDiscount=discount(line.discountType,line.discountValue||"0");
    if(!line.name.trim()||price===null||cost===null||!lineDiscount)errors.lines=`Correct line ${index+1}.`;
    return {currency:"USD",quantity:line.quantity,unitPriceCents:price??-1,taxable:line.taxable,taxRateBasisPoints:line.taxRateBasisPoints,discount:lineDiscount??undefined};
  });
  const feeCents=fees.map((fee,index)=>{const amount=parseCurrencyToCents(fee.amount);if(!fee.name.trim()||amount===null)errors.fees=`Correct fee ${index+1}.`;return amount??-1;});
  const documentDiscount=discount(text(data,"documentDiscountType"),text(data,"documentDiscountValue")||"0");
  const deposit=discount(text(data,"depositType"),text(data,"depositValue")||"0");
  if(!documentDiscount)errors.documentDiscountValue="Enter a valid document discount.";
  if(!deposit)errors.depositValue="Enter a valid deposit.";
  let totals;
  if(!Object.keys(errors).length){
    try{totals=calculateFinancialDocument({currency:"USD",lines:lineInputs,feesCents:feeCents,documentDiscount:documentDiscount!,deposit:deposit!});}
    catch(error){errors.lines=error instanceof Error?error.message:"Invoice totals are invalid.";}
  }
  const issueDate=text(data,"issueDate")||null,dueDate=text(data,"dueDate")||null;
  const minimumPartialPayment=parseCurrencyToCents(text(data,"minimumPartialPayment")||"1.00");
  if(minimumPartialPayment===null||minimumPartialPayment<50)errors.minimumPartialPayment="Minimum partial payment must be at least $0.50.";
  if(issueDate&&dueDate&&dueDate<issueDate)errors.dueDate="Due date must be on or after the issue date.";
  if(Object.keys(errors).length||!totals)return {error:"Please correct the highlighted fields.",errors,values};
  return {values,lines,fees,totals,payload:{
    customer_id:customerId,service_location_id:locationId,job_id:jobId,title,
    customer_notes:text(data,"customerMessage")||null,internal_notes:text(data,"internalNotes")||null,
    currency:"USD",subtotal_cents:totals.subtotalCents,discount_total_cents:totals.discountTotalCents,
    tax_total_cents:totals.taxTotalCents,fee_total_cents:totals.feeTotalCents,grand_total_cents:totals.grandTotalCents,
    deposit_type:text(data,"depositType"),deposit_value:deposit!.value,deposit_required_cents:totals.depositRequiredCents,
    balance_due_cents:totals.grandTotalCents,document_discount_type:text(data,"documentDiscountType"),
    document_discount_value:documentDiscount!.value,issue_date:issueDate,due_date:dueDate,
    allow_partial_payments:data.get("allowPartialPayments")==="on",
    minimum_partial_payment_cents:minimumPartialPayment!,
  }};
}

async function replaceChildren(context:Awaited<ReturnType<typeof requireWorkspace>>,invoiceId:string,prepared:Extract<Awaited<ReturnType<typeof prepare>>,{payload:object}>){
  const {supabase,business}=context;
  const [lineDelete,feeDelete]=await Promise.all([
    supabase.from("invoice_line_items").delete().eq("business_id",business.id).eq("invoice_id",invoiceId),
    supabase.from("invoice_fees").delete().eq("business_id",business.id).eq("invoice_id",invoiceId),
  ]);
  if(lineDelete.error||feeDelete.error)return lineDelete.error??feeDelete.error;
  const lineRows=prepared.lines.map((line,index)=>{
    const calculated=prepared.totals.lines[index];
    return {
      business_id:business.id,invoice_id:invoiceId,price_book_item_id:line.priceBookItemId||null,
      service_id:line.serviceId||null,name_snapshot:line.name.trim(),description_snapshot:line.description?.trim()||null,
      quantity:line.quantity,unit_type_snapshot:line.unitType,unit_price_cents:parseCurrencyToCents(line.unitPrice)!,
      internal_unit_cost_cents:parseCurrencyToCents(line.internalCost||"0")!,discount_type:line.discountType,
      discount_value:discount(line.discountType,line.discountValue||"0")?.value??0,
      line_discount_cents:calculated.lineDiscountCents+calculated.documentDiscountShareCents,
      is_taxable:line.taxable,tax_rate_basis_points:line.taxRateBasisPoints,line_subtotal_cents:calculated.lineSubtotalCents,
      tax_amount_cents:calculated.taxCents,line_total_cents:calculated.lineTotalCents,sort_order:index,
    };
  });
  const feeRows=prepared.fees.map((fee,index)=>({business_id:business.id,invoice_id:invoiceId,name_snapshot:fee.name.trim(),amount_cents:parseCurrencyToCents(fee.amount)!,sort_order:index}));
  const [lineInsert,feeInsert]=await Promise.all([
    supabase.from("invoice_line_items").insert(lineRows),
    feeRows.length?supabase.from("invoice_fees").insert(feeRows):Promise.resolve({error:null}),
  ]);
  return lineInsert.error??feeInsert.error;
}

export async function createInvoice(slug:string,_state:InvoiceActionState,data:FormData):Promise<InvoiceActionState>{
  const context=await requireWorkspace(slug),values=valuesFrom(data);
  if(!canManageCustomers(context.role))return {error:"You do not have permission to create invoices.",values};
  const requestKey=text(data,"requestKey");
  if(!/^[0-9a-f-]{36}$/i.test(requestKey))return {error:"Refresh the page before submitting.",values};
  const {data:existing}=await context.supabase.from("invoices").select("id").eq("business_id",context.business.id).eq("request_key",requestKey).maybeSingle();
  if(existing)redirect(`/app/${slug}/invoices/${existing.id}`);
  const prepared=await prepare(data,context);
  if(!prepared.payload||!prepared.lines||!prepared.fees||!prepared.totals)return {error:prepared.error,fieldErrors:prepared.errors,values:prepared.values};
  if(prepared.payload.job_id){
    const {data:sourceInvoice}=await context.supabase.from("invoices").select("id")
      .eq("business_id",context.business.id).eq("source_key",prepared.payload.job_id).maybeSingle();
    if(sourceInvoice)redirect(`/app/${slug}/invoices/${sourceInvoice.id}?success=Invoice+already+exists+for+this+job`);
  }
  const {data:number,error:numberError}=await context.supabase.rpc("next_financial_document_number",{p_business_id:context.business.id,p_document_type:"invoice"});
  if(numberError||!number){console.error("Invoice numbering failed",{code:numberError?.code,businessId:context.business.id});return {error:"Invoice numbering is unavailable. Apply the latest Epic 6 migration if this continues.",values};}
  const {data:invoice,error}=await context.supabase.from("invoices").insert({
    ...prepared.payload,business_id:context.business.id,invoice_number:number,status:"draft",request_key:requestKey,
    source_key:prepared.payload.job_id,created_by:context.user.id,updated_by:context.user.id,
  }).select("id").single();
  if(error||!invoice){console.error("Invoice creation failed",{code:error?.code,message:error?.message,businessId:context.business.id});return {error:error?.code==="23503"?"The selected customer, location, or job is no longer available.":"The invoice could not be created. Your entries are still here.",values};}
  const childError=await replaceChildren(context,invoice.id,prepared);
  if(childError){await context.supabase.from("invoices").update({is_deleted:true}).eq("id",invoice.id);console.error("Invoice lines creation failed",{code:childError.code,invoiceId:invoice.id,businessId:context.business.id});return {error:"The invoice header was created, but its line items could not be saved.",values};}
  await context.supabase.from("invoice_events").insert({business_id:context.business.id,invoice_id:invoice.id,event_type:"created",actor_user_id:context.user.id});
  redirect(`/app/${slug}/invoices/${invoice.id}?success=Invoice+created`);
}

export async function updateInvoice(slug:string,invoiceId:string,_state:InvoiceActionState,data:FormData):Promise<InvoiceActionState>{
  const context=await requireWorkspace(slug);
  if(!canManageCustomers(context.role))return {error:"You do not have permission to edit invoices."};
  const {data:current}=await context.supabase.from("invoices").select("status").eq("id",invoiceId).eq("business_id",context.business.id).eq("is_deleted",false).maybeSingle();
  if(!current)return {error:"Invoice not found."};
  if(current.status!=="draft")return {error:"Only draft invoices can be edited. Paid invoices are immutable."};
  const prepared=await prepare(data,context);
  if(!prepared.payload||!prepared.lines||!prepared.fees||!prepared.totals)return {error:prepared.error,fieldErrors:prepared.errors,values:prepared.values};
  const {error}=await context.supabase.from("invoices").update({...prepared.payload,updated_by:context.user.id}).eq("id",invoiceId).eq("business_id",context.business.id).eq("status","draft");
  if(error){console.error("Invoice update failed",{code:error.code,invoiceId,businessId:context.business.id});return {error:"The invoice could not be saved.",values:prepared.values};}
  const childError=await replaceChildren(context,invoiceId,prepared);
  if(childError)return {error:"Invoice details saved, but line items could not be replaced.",values:prepared.values};
  await context.supabase.from("invoice_events").insert({business_id:context.business.id,invoice_id:invoiceId,event_type:"updated",actor_user_id:context.user.id});
  redirect(path(slug,invoiceId,"success","Invoice updated"));
}

export async function sendInvoice(slug:string,invoiceId:string){
  const {supabase,business,user,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(path(slug,invoiceId,"error","Permission denied"));
  const token=generatePublicDocumentToken(),tokenHash=await publicDocumentTokenHash(token);
  const expiresAt=new Date(Date.now()+365*24*60*60*1000).toISOString();
  const {data,error}=await supabase.from("invoices").update({
    status:"sent",sent_at:new Date().toISOString(),updated_by:user.id,
    public_token_hash:tokenHash,public_token_expires_at:expiresAt,public_token_revoked_at:null,
  })
    .eq("id",invoiceId).eq("business_id",business.id).eq("status","draft").select("id").maybeSingle();
  if(error||!data)redirect(path(slug,invoiceId,"error","Only a complete draft invoice can be sent"));
  await supabase.from("invoice_events").insert({business_id:business.id,invoice_id:invoiceId,event_type:"sent",actor_user_id:user.id});
  revalidatePath(`/app/${slug}/invoices`);
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||(await headers()).get("origin")||"http://localhost:3000").replace(/\/$/,"");
  redirect(`/app/${slug}/invoices/${invoiceId}?success=${encodeURIComponent("Invoice marked sent")}&publicLink=${encodeURIComponent(`${origin}/invoice/${token}`)}`);
}

export async function resendInvoice(slug:string,invoiceId:string){
  const {supabase,business,user,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(path(slug,invoiceId,"error","Permission denied"));
  const {data:invoice}=await supabase.from("invoices").select("status").eq("id",invoiceId).eq("business_id",business.id).maybeSingle();
  if(!invoice||!["sent","viewed","partially_paid","overdue"].includes(invoice.status))redirect(path(slug,invoiceId,"error","This invoice cannot be resent"));
  const token=generatePublicDocumentToken(),tokenHash=await publicDocumentTokenHash(token);
  const expiresAt=new Date(Date.now()+365*24*60*60*1000).toISOString();
  const {error}=await supabase.from("invoices").update({
    public_token_hash:tokenHash,public_token_expires_at:expiresAt,public_token_revoked_at:null,updated_by:user.id,
  }).eq("id",invoiceId).eq("business_id",business.id);
  if(error){console.error("Invoice portal link rotation failed",{code:error.code,businessId:business.id,invoiceId});redirect(path(slug,invoiceId,"error","A new secure invoice link could not be created"));}
  await supabase.from("invoice_events").insert({business_id:business.id,invoice_id:invoiceId,event_type:"sent",actor_user_id:user.id,metadata:{resend:true}});
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||(await headers()).get("origin")||"http://localhost:3000").replace(/\/$/,"");
  redirect(`/app/${slug}/invoices/${invoiceId}?success=${encodeURIComponent("New secure invoice link created")}&publicLink=${encodeURIComponent(`${origin}/invoice/${token}`)}`);
}

export async function duplicateInvoice(slug:string,invoiceId:string){
  const {supabase,business,user,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(path(slug,invoiceId,"error","Permission denied"));
  const [{data:source},{data:lines},{data:fees}]=await Promise.all([
    supabase.from("invoices").select("*").eq("id",invoiceId).eq("business_id",business.id).maybeSingle(),
    supabase.from("invoice_line_items").select("*").eq("invoice_id",invoiceId).eq("business_id",business.id).order("sort_order"),
    supabase.from("invoice_fees").select("*").eq("invoice_id",invoiceId).eq("business_id",business.id).order("sort_order"),
  ]);
  if(!source)redirect(`/app/${slug}/invoices?error=Invoice+not+found`);
  const {data:number}=await supabase.rpc("next_financial_document_number",{p_business_id:business.id,p_document_type:"invoice"});
  const copy={...source};
  for(const key of ["id","created_at","updated_at","invoice_number","request_key","source_key","public_token_hash","public_token_expires_at","public_token_revoked_at"] as const)delete copy[key];
  const {data:invoice,error}=await supabase.from("invoices").insert({...copy,business_id:business.id,invoice_number:number,status:"draft",title:`${source.title} (copy)`,estimate_id:null,amount_paid_cents:0,amount_refunded_cents:0,balance_due_cents:source.grand_total_cents,sent_at:null,viewed_at:null,paid_at:null,voided_at:null,created_by:user.id,updated_by:user.id}).select("id").single();
  if(error||!invoice)redirect(path(slug,invoiceId,"error","Invoice could not be duplicated"));
  await Promise.all([
    supabase.from("invoice_line_items").insert((lines??[]).map((line)=>{
      const copy={...line,invoice_id:invoice.id,estimate_line_item_id:null};
      delete copy.id;delete copy.created_at;delete copy.updated_at;
      return copy;
    })),
    (fees??[]).length?supabase.from("invoice_fees").insert((fees??[]).map((fee)=>{
      const copy={...fee,invoice_id:invoice.id};delete copy.id;delete copy.created_at;return copy;
    })):Promise.resolve(),
  ]);
  await supabase.from("invoice_events").insert({business_id:business.id,invoice_id:invoice.id,event_type:"created",actor_user_id:user.id,metadata:{duplicated_from:invoiceId}});
  redirect(`/app/${slug}/invoices/${invoice.id}?success=Invoice+duplicated`);
}

export async function voidInvoice(slug:string,invoiceId:string,data:FormData){
  const {supabase,business,user,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(path(slug,invoiceId,"error","Permission denied"));
  const reason=text(data,"reason");
  if(!reason)redirect(path(slug,invoiceId,"error","Enter a reason before voiding the invoice"));
  const {error}=await supabase.from("invoices").update({status:"void",voided_at:new Date().toISOString(),voided_by:user.id,void_reason:reason,public_token_revoked_at:new Date().toISOString(),updated_by:user.id})
    .eq("id",invoiceId).eq("business_id",business.id).in("status",["draft","sent","viewed","overdue"]);
  if(error)redirect(path(slug,invoiceId,"error","Invoice could not be voided"));
  await supabase.from("invoice_events").insert({business_id:business.id,invoice_id:invoiceId,event_type:"voided",actor_user_id:user.id,metadata:{reason}});
  redirect(path(slug,invoiceId,"success","Invoice voided"));
}

export async function recordOfflinePayment(slug:string,invoiceId:string,data:FormData){
  const {supabase,business,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(path(slug,invoiceId,"error","Permission denied"));
  const amount=parseCurrencyToCents(text(data,"amount")),requestKey=text(data,"requestKey");
  if(amount===null||amount<=0)redirect(path(slug,invoiceId,"error","Enter a valid payment amount"));
  if(!/^[0-9a-f-]{36}$/i.test(requestKey))redirect(path(slug,invoiceId,"error","Refresh before recording the payment"));
  const receivedLocal=text(data,"receivedAt");
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(receivedLocal))redirect(path(slug,invoiceId,"error","Enter a valid received date and time"));
  const [receivedDate,receivedTime]=receivedLocal.split("T");
  const receivedAt=zonedDateTimeToUtc(receivedDate,receivedTime,business.timezone);
  const {error}=await supabase.rpc("record_invoice_offline_payment",{
    p_business_id:business.id,p_invoice_id:invoiceId,p_amount_cents:amount,p_method:text(data,"method"),
    p_received_at:receivedAt.toISOString(),p_reference:text(data,"reference"),
    p_notes:text(data,"notes"),p_idempotency_key:requestKey,
  });
  if(error){console.error("Offline invoice payment failed",{code:error.code,message:error.message,businessId:business.id,invoiceId});redirect(path(slug,invoiceId,"error",error.code==="23514"?"Payment exceeds the balance or the invoice cannot accept payments.":"Payment could not be recorded. Apply the Checkpoint 6 migration if needed."));}
  revalidatePath(`/app/${slug}/invoices/${invoiceId}`);
  redirect(path(slug,invoiceId,"success","Offline payment recorded"));
}

export async function voidOfflinePayment(slug:string,invoiceId:string,paymentId:string,data:FormData){
  const {supabase,business,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(path(slug,invoiceId,"error","Permission denied"));
  const reason=text(data,"reason");
  if(reason.length<3)redirect(path(slug,invoiceId,"error","Enter a payment void reason"));
  const {error}=await supabase.rpc("void_invoice_offline_payment",{
    p_business_id:business.id,p_payment_id:paymentId,p_reason:reason,
  });
  if(error){
    console.error("Offline payment void failed",{code:error.code,businessId:business.id,invoiceId,paymentId});
    redirect(path(slug,invoiceId,"error","This offline payment could not be voided"));
  }
  revalidatePath(`/app/${slug}/invoices/${invoiceId}`);
  redirect(path(slug,invoiceId,"success","Offline payment voided"));
}

export async function refundInvoicePayment(slug:string,invoiceId:string,paymentId:string,data:FormData){
  const {supabase,business,role}=await requireWorkspace(slug);
  if(!canManageCustomers(role))redirect(path(slug,invoiceId,"error","Permission denied"));
  const amount=parseCurrencyToCents(text(data,"amount")),reason=text(data,"reason");
  const method=text(data,"refundMethod"),requestKey=text(data,"requestKey");
  if(amount===null||amount<=0)redirect(path(slug,invoiceId,"error","Enter a valid refund amount"));
  if(reason.length<3)redirect(path(slug,invoiceId,"error","Enter a refund reason"));
  if(!["provider","offline"].includes(method))redirect(path(slug,invoiceId,"error","Choose a valid refund method"));
  if(!/^[0-9a-f-]{36}$/i.test(requestKey))redirect(path(slug,invoiceId,"error","Refresh before issuing the refund"));
  const {data:payment,error:paymentError}=await supabase.from("payments")
    .select("id,provider,provider_account_id,provider_payment_intent_id,amount_cents,refunded_amount_cents,status")
    .eq("id",paymentId).eq("invoice_id",invoiceId).eq("business_id",business.id).maybeSingle();
  if(paymentError||!payment)redirect(path(slug,invoiceId,"error","Payment not found"));
  const refundable=Number(payment.amount_cents)-Number(payment.refunded_amount_cents);
  if(!["succeeded","partially_refunded"].includes(payment.status)||amount>refundable){
    redirect(path(slug,invoiceId,"error","Refund exceeds the refundable payment amount"));
  }
  if(method==="provider"&&(payment.provider!=="stripe"||!payment.provider_account_id||!payment.provider_payment_intent_id)){
    redirect(path(slug,invoiceId,"error","A provider refund is unavailable for this payment"));
  }
  const {data:refundId,error:requestError}=await supabase.rpc("create_invoice_refund_request",{
    p_business_id:business.id,p_payment_id:payment.id,p_amount_cents:amount,p_refund_method:method,
    p_reason:reason,p_internal_notes:text(data,"notes"),p_offline_reference:text(data,"reference"),
    p_idempotency_key:requestKey,
  });
  if(requestError||!refundId){
    console.error("Invoice refund request failed",{code:requestError?.code,businessId:business.id,invoiceId,paymentId});
    redirect(path(slug,invoiceId,"error","The refund request could not be created"));
  }
  let status:"pending"|"requires_action"|"succeeded"|"failed"|"canceled"="succeeded";
  let providerRefundId:string|null=null,failureMessage:string|null=null;
  if(method==="provider"){
    try{
      const stripe=stripeClient();
      const refund=await stripe.refunds.create({
        payment_intent:payment.provider_payment_intent_id,amount,
        metadata:{servonas_kind:"invoice_refund",refund_id:String(refundId),invoice_id:invoiceId},
      },{stripeAccount:payment.provider_account_id,idempotencyKey:`servonas-refund-${business.id}-${refundId}`});
      providerRefundId=refund.id;
      status=refund.status==="succeeded"?"succeeded":refund.status==="failed"?"failed":
        refund.status==="canceled"?"canceled":refund.status==="requires_action"?"requires_action":"pending";
      failureMessage=refund.failure_reason??null;
    }catch(error){
      const detail=stripeProviderError(error);
      status="failed";failureMessage=detail.message;
      console.error("Stripe invoice refund failed",{businessId:business.id,invoiceId,paymentId,refundId,...detail});
    }
  }
  const {error:reconcileError}=await supabase.rpc("reconcile_invoice_refund",{
    p_business_id:business.id,p_refund_id:refundId,p_status:status,
    p_provider_refund_id:providerRefundId,p_failure_message:failureMessage,
    p_completed_at:status==="succeeded"?new Date().toISOString():null,
  });
  if(reconcileError){
    console.error("Invoice refund reconciliation failed",{code:reconcileError.code,businessId:business.id,invoiceId,paymentId,refundId,status});
    redirect(path(slug,invoiceId,"error","The refund status could not be recorded. Do not retry until the payment history is checked."));
  }
  revalidatePath(`/app/${slug}/invoices/${invoiceId}`);
  if(status==="failed")redirect(path(slug,invoiceId,"error","The refund failed. No invoice balance was changed."));
  redirect(path(slug,invoiceId,"success",status==="succeeded"?"Refund recorded":"Refund submitted; provider confirmation is pending"));
}
