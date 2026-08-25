import Link from "next/link";
import { notFound } from "next/navigation";
import EstimateForm from "@/components/EstimateForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../../WorkspaceNav";
import type { EstimateLineDraft } from "../../../estimates/actions";
import { updateInvoice } from "../../actions";

export default async function EditInvoice({params}:{params:Promise<{businessSlug:string;invoiceId:string}>}){
  const {businessSlug,invoiceId}=await params,{supabase,business,role}=await requireWorkspace(businessSlug);
  const [{data:invoice},{data:lines},{data:fees},{data:customers},{data:locations},{data:jobs},{data:priceItems},{data:billingSettings}]=await Promise.all([
    supabase.from("invoices").select("*").eq("id",invoiceId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle(),
    supabase.from("invoice_line_items").select("*").eq("invoice_id",invoiceId).eq("business_id",business.id).order("sort_order"),
    supabase.from("invoice_fees").select("*").eq("invoice_id",invoiceId).eq("business_id",business.id).order("sort_order"),
    supabase.from("customers").select("id,first_name,last_name,company_name,tax_exempt,tax_exemption_reference").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("jobs").select("id,customer_id,job_number,title").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("price_book_items").select("id,name,description,unit_type,default_unit_price_cents,internal_cost_cents,is_taxable,service_id,tax_code").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("business_billing_settings").select("tax_enabled,default_tax_rate_basis_points,tax_calculation_method,tax_display_mode,default_invoice_item_taxable").eq("business_id",business.id).maybeSingle(),
  ]);
  if(!invoice)notFound();
  if(!canManageCustomers(role)||invoice.status!=="draft")return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><div className="workspace-notice error">Only draft invoices are editable. Paid invoices cannot be changed.</div></section></main>;
  const initialLines:EstimateLineDraft[]=(lines??[]).map(line=>({priceBookItemId:line.price_book_item_id??undefined,serviceId:line.service_id??undefined,name:line.name_snapshot,description:line.description_snapshot??"",quantity:String(line.quantity),unitType:line.unit_type_snapshot,unitPrice:(line.unit_price_cents/100).toFixed(2),internalCost:(line.internal_unit_cost_cents/100).toFixed(2),discountType:line.discount_type as EstimateLineDraft["discountType"],discountValue:line.discount_type==="fixed"?(line.discount_value/100).toFixed(2):line.discount_type==="percentage"?(line.discount_value/100).toFixed(2):"0",taxable:line.is_taxable,taxCode:line.tax_code_snapshot??""}));
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="epic3-header"><div><small>{invoice.invoice_number}</small><h1>Edit invoice</h1></div><Link href={`/app/${businessSlug}/invoices/${invoiceId}`}>Back</Link></header><section className="workspace-panel"><EstimateForm documentType="invoice" action={updateInvoice.bind(null,businessSlug,invoiceId)} customers={customers??[]} locations={locations??[]} jobs={jobs??[]} priceItems={priceItems??[]} businessTaxSettings={{taxEnabled:Boolean(billingSettings?.tax_enabled),calculationMethod:billingSettings?.tax_calculation_method==="automatic"?"automatic":"manual",manualTaxRateBasisPoints:Number(billingSettings?.default_tax_rate_basis_points??0),displayMode:billingSettings?.tax_display_mode==="inclusive"?"inclusive":"exclusive",defaultInvoiceItemTaxable:Boolean(billingSettings?.default_invoice_item_taxable??true)}} estimate={invoice} initialLines={initialLines} initialFees={(fees??[]).map(fee=>({name:fee.name_snapshot,amount:(fee.amount_cents/100).toFixed(2)}))} submitLabel="Save invoice"/></section></section></main>;
}
