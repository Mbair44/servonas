import Link from "next/link";
import EstimateForm from "@/components/EstimateForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { createEstimate } from "../actions";

export default async function NewEstimate({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params; const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">Permission denied.</div></section></main>;
  const [{data:customers},{data:locations},{data:jobs},{data:priceItems},{data:taxRates}] = await Promise.all([
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("last_name"),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true),
    supabase.from("jobs").select("id,customer_id,job_number,title").eq("business_id",business.id).eq("is_deleted",false).order("created_at",{ascending:false}),
    supabase.from("price_book_items").select("id,name,description,unit_type,default_unit_price_cents,internal_cost_cents,is_taxable,service_id").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("sort_order").order("name"),
    supabase.from("tax_rates").select("id,name,rate_basis_points,is_default").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("name"),
  ]);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><header className="epic3-header"><div><small>Estimates</small><h1>New estimate</h1><p>Totals are recalculated on the server when saved.</p></div><Link href={`/app/${businessSlug}/estimates`}>Back to estimates</Link></header><section className="workspace-panel"><EstimateForm action={createEstimate.bind(null,businessSlug)} customers={customers??[]} locations={locations??[]} jobs={jobs??[]} priceItems={priceItems??[]} taxRates={taxRates??[]} submitLabel="Save draft"/></section></section></main>;
}
