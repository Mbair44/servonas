import Link from "next/link";
import EstimateForm from "@/components/EstimateForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { createInvoice } from "../actions";

export default async function NewInvoice({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{jobId?:string}>}){
  const {businessSlug}=await params,{jobId}=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
  if(!canManageCustomers(role))return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><div className="workspace-notice error">Permission denied.</div></section></main>;
  const [{data:customers},{data:locations},{data:jobs},{data:priceItems},{data:billingSettings},{data:paymentAccount},{data:sourceJob}]=await Promise.all([
    supabase.from("customers").select("id,first_name,last_name,company_name,tax_exempt,tax_exemption_reference").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("last_name"),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true),
    supabase.from("jobs").select("id,customer_id,job_number,title").eq("business_id",business.id).eq("is_deleted",false).order("created_at",{ascending:false}),
    supabase.from("price_book_items").select("id,name,description,unit_type,default_unit_price_cents,internal_cost_cents,is_taxable,service_id,tax_code").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("sort_order").order("name"),
    supabase.from("business_billing_settings").select("tax_enabled,default_tax_rate_basis_points,tax_calculation_method,tax_display_mode,default_invoice_item_taxable").eq("business_id",business.id).maybeSingle(),
    supabase.from("business_payment_accounts").select("provider_account_id,charges_enabled,payouts_enabled,onboarding_status").eq("business_id",business.id).eq("provider","stripe").maybeSingle(),
    jobId?supabase.from("jobs").select("id,customer_id,service_location_id,title").eq("id",jobId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle():Promise.resolve({data:null}),
  ]);
  const initial=sourceJob?{customer_id:sourceJob.customer_id,service_location_id:sourceJob.service_location_id,job_id:sourceJob.id,title:sourceJob.title}:undefined;
  const onlinePaymentsReady=Boolean(paymentAccount?.provider_account_id&&paymentAccount?.charges_enabled&&paymentAccount?.payouts_enabled&&paymentAccount?.onboarding_status==="completed");
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="epic3-header epic3-header-compact"><div><small>Invoices</small><h1>New invoice</h1><p>{sourceJob?"Create and review a customer invoice from this job.":"Create and send an invoice to a customer."}</p></div><Link href={`/app/${businessSlug}/invoices`}>Back to invoices</Link></header><EstimateForm documentType="invoice" newDocument action={createInvoice.bind(null,businessSlug)} customers={customers??[]} locations={locations??[]} jobs={jobs??[]} priceItems={priceItems??[]} businessTaxSettings={{taxEnabled:Boolean(billingSettings?.tax_enabled),calculationMethod:billingSettings?.tax_calculation_method==="automatic"?"automatic":"manual",manualTaxRateBasisPoints:Number(billingSettings?.default_tax_rate_basis_points??0),displayMode:billingSettings?.tax_display_mode==="inclusive"?"inclusive":"exclusive",defaultInvoiceItemTaxable:Boolean(billingSettings?.default_invoice_item_taxable??true)}} onlinePaymentsReady={onlinePaymentsReady} estimate={initial} submitLabel="Create invoice"/></section></main>;
}
