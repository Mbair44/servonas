import Link from "next/link";
import { notFound } from "next/navigation";
import EstimateForm from "@/components/EstimateForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../../WorkspaceNav";
import { updateEstimate, type EstimateLineDraft } from "../../actions";

export default async function EditEstimate({ params }: { params: Promise<{ businessSlug:string; estimateId:string }> }) {
  const { businessSlug, estimateId } = await params; const { supabase,business,role }=await requireWorkspace(businessSlug);
  const [{data:estimate},{data:lines},{data:fees},{data:customers},{data:locations},{data:jobs},{data:priceItems},{data:taxRates}] = await Promise.all([
    supabase.from("estimates").select("*").eq("id",estimateId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle(),
    supabase.from("estimate_line_items").select("*").eq("estimate_id",estimateId).eq("business_id",business.id).order("sort_order"),
    supabase.from("estimate_fees").select("*").eq("estimate_id",estimateId).eq("business_id",business.id).order("sort_order"),
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("jobs").select("id,customer_id,job_number,title").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("price_book_items").select("id,name,description,unit_type,default_unit_price_cents,internal_cost_cents,is_taxable,service_id").eq("business_id",business.id).eq("is_deleted",false),
    supabase.from("tax_rates").select("id,name,rate_basis_points,is_default").eq("business_id",business.id).eq("is_deleted",false),
  ]);
  if(!estimate) notFound();
  if(!canManageCustomers(role)||estimate.status!=="draft") return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">This estimate is not editable. Start a revision first.</div></section></main>;
  const initialLines:EstimateLineDraft[]=(lines??[]).map(line=>({priceBookItemId:line.price_book_item_id??undefined,serviceId:line.service_id??undefined,name:line.name_snapshot,description:line.description_snapshot??"",quantity:String(line.quantity),unitType:line.unit_type_snapshot,unitPrice:(line.unit_price_cents/100).toFixed(2),internalCost:(line.internal_unit_cost_cents/100).toFixed(2),discountType:line.discount_type as EstimateLineDraft["discountType"],discountValue:line.discount_type==="fixed"?(line.discount_value/100).toFixed(2):line.discount_type==="percentage"?(line.discount_value/100).toFixed(2):"0",taxable:line.is_taxable,taxRateBasisPoints:line.tax_rate_basis_points}));
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><header className="epic3-header"><div><small>{estimate.estimate_number}</small><h1>Edit estimate</h1></div><Link href={`/app/${businessSlug}/estimates/${estimateId}`}>Back</Link></header><section className="workspace-panel"><EstimateForm action={updateEstimate.bind(null,businessSlug,estimateId)} customers={customers??[]} locations={locations??[]} jobs={jobs??[]} priceItems={priceItems??[]} taxRates={taxRates??[]} estimate={estimate} initialLines={initialLines} initialFees={(fees??[]).map(fee=>({name:fee.name_snapshot,amount:(fee.amount_cents/100).toFixed(2)}))} submitLabel="Save estimate"/></section></section></main>;
}
