import type {SupabaseClient} from "@supabase/supabase-js";
export const collectibleInvoiceStatuses=["sent","viewed","partially_paid","overdue"];
type Receivable={status:string;balance_due_cents:number|string|null;due_date?:string|null;is_deleted?:boolean};
export function isOutstandingInvoice(invoice:Receivable){
 return !invoice.is_deleted&&collectibleInvoiceStatuses.includes(invoice.status)&&Number(invoice.balance_due_cents)>0;
}
export function isOverdueInvoice(invoice:Receivable,today:string){
 return isOutstandingInvoice(invoice)&&Boolean(invoice.due_date&&invoice.due_date<today);
}
export async function loadOverdueInvoiceSummary(db:SupabaseClient,businessId:string,today:string){
 let overdueCount=0,overdueAmountCents=0;
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from("invoices").select("id,status,balance_due_cents,due_date")
   .eq("business_id",businessId).eq("is_deleted",false).in("status",collectibleInvoiceStatuses)
   .gt("balance_due_cents",0).lt("due_date",today).order("id").range(offset,offset+499);
  if(error)throw new Error("Unable to load overdue invoice totals.");
  for(const invoice of data??[])if(isOverdueInvoice(invoice,today)){overdueCount++;overdueAmountCents+=Number(invoice.balance_due_cents);}
  if((data?.length??0)<500)break;
 }
 return {overdueCount,overdueAmountCents};
}
