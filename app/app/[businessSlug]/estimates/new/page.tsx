import Link from "next/link";
import EstimateForm from "@/components/EstimateForm";
import { canManageCustomers } from "@/lib/access";
import { normalizeLandscapeShapes, type LandscapeShape } from "@/lib/landscapingMeasurements";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { createEstimate, type EstimateLineDraft } from "../actions";

export default async function NewEstimate({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<{ measurementId?: string }> }) {
  const { businessSlug } = await params;
  const { measurementId } = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><div className="workspace-notice error">Permission denied.</div></section></main>;
  const measurementRequest = business.industry_profile === "lawn_care" && measurementId
    ? supabase.from("landscaping_property_measurements").select("id,name,customer_id,service_location_id,shapes").eq("business_id", business.id).eq("id", measurementId).maybeSingle()
    : Promise.resolve({ data: null });
  const [{data:customers},{data:locations},{data:jobs},{data:priceItems},{data:taxRates},{data:measurement}] = await Promise.all([
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("last_name"),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true),
    supabase.from("jobs").select("id,customer_id,job_number,title").eq("business_id",business.id).eq("is_deleted",false).order("created_at",{ascending:false}),
    supabase.from("price_book_items").select("id,name,description,unit_type,default_unit_price_cents,internal_cost_cents,is_taxable,service_id").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("sort_order").order("name"),
    supabase.from("tax_rates").select("id,name,rate_basis_points,is_default").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("name"),
    measurementRequest,
  ]);
  const shapes = normalizeLandscapeShapes(measurement?.shapes);
  const defaultTax = taxRates?.find((rate) => rate.is_default);
  const lineFor = (shape: LandscapeShape): EstimateLineDraft => {
    const unitType = shape.kind === "perimeter" ? "foot" : "square_foot";
    const item = priceItems?.find((candidate) => candidate.unit_type === unitType);
    return { priceBookItemId:item?.id, serviceId:item?.service_id??undefined, name:item?.name?`${item.name} — ${shape.label}`:`${shape.label} (satellite measurement)`, description:"Satellite-traced property measurement. Verify quantities onsite before final approval.", quantity:String(shape.kind==="perimeter"?shape.lengthFt:shape.areaSqFt), unitType, unitPrice:((item?.default_unit_price_cents??0)/100).toFixed(2), internalCost:((item?.internal_cost_cents??0)/100).toFixed(2), discountType:"none", discountValue:"0", taxable:item?.is_taxable??true, taxRateBasisPoints:item?.is_taxable===false?0:defaultTax?.rate_basis_points??0 };
  };
  const estimate = measurement ? { customer_id:measurement.customer_id, service_location_id:measurement.service_location_id, title:`${measurement.name} landscaping estimate` } : undefined;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="epic3-header"><div><small>Estimates</small><h1>New estimate</h1><p>{measurement?"Property measurements have been added as editable line items.":"Totals are recalculated on the server when saved."}</p></div><Link href={`/app/${businessSlug}/estimates`}>Back to estimates</Link></header>{measurement&&<div className="workspace-notice warning"><div><strong>Verify satellite measurements onsite</strong><p>Imagery measurements are planning estimates and are not a survey. Review quantities and prices before sending.</p></div></div>}<section className="workspace-panel"><EstimateForm action={createEstimate.bind(null,businessSlug)} customers={customers??[]} locations={locations??[]} jobs={jobs??[]} priceItems={priceItems??[]} taxRates={taxRates??[]} estimate={estimate} initialLines={shapes.map(lineFor)} submitLabel="Save draft" newDocument={Boolean(measurement)}/></section></section></main>;
}
