import Link from "next/link";
import EstimateForm from "@/components/EstimateForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { createInvoice } from "../actions";

export default async function NewInvoice({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{jobId?:string}>}){
  const {businessSlug}=await params,{jobId}=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
  if(!canManageCustomers(role))return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">Permission denied.</div></section></main>;
  const [{data:customers},{data:locations},{data:jobs},{data:priceItems},{data:taxRates},{data:sourceJob}]=await Promise.all([
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("last_name"),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true),
    supabase.from("jobs").select("id,customer_id,job_number,title").eq("business_id",business.id).eq("is_deleted",false).order("created_at",{ascending:false}),
    supabase.from("price_book_items").select("id,name,description,unit_type,default_unit_price_cents,internal_cost_cents,is_taxable,service_id").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("sort_order").order("name"),
    supabase.from("tax_rates").select("id,name,rate_basis_points,is_default").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("name"),
    jobId?supabase.from("jobs").select("id,customer_id,service_location_id,title").eq("id",jobId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle():Promise.resolve({data:null}),
  ]);
  const initial=sourceJob?{customer_id:sourceJob.customer_id,service_location_id:sourceJob.service_location_id,job_id:sourceJob.id,title:sourceJob.title}:undefined;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><header className="epic3-header"><div><small>Invoices</small><h1>New invoice</h1><p>{sourceJob?"Creating from a job with source traceability.":"Create a standalone customer invoice."}</p></div><Link href={`/app/${businessSlug}/invoices`}>Back to invoices</Link></header><section className="workspace-panel"><EstimateForm documentType="invoice" newDocument action={createInvoice.bind(null,businessSlug)} customers={customers??[]} locations={locations??[]} jobs={jobs??[]} priceItems={priceItems??[]} taxRates={taxRates??[]} estimate={initial} submitLabel="Save draft"/></section></section></main>;
}
