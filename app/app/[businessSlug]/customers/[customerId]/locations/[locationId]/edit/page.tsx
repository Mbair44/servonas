import Link from "next/link";
import { notFound } from "next/navigation";
import ServiceLocationForm from "@/components/ServiceLocationForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../../../../WorkspaceNav";
import { saveServiceLocation } from "../../../../actions";

export default async function EditLocation({ params }: { params: Promise<{ businessSlug: string; customerId: string; locationId: string }> }) {
  const { businessSlug, customerId, locationId } = await params;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const { data: location } = await supabase.from("service_locations").select("*").eq("id", locationId).eq("customer_id", customerId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!location) notFound();
  if (!canManageCustomers(role)) notFound();
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Service location</small><h1>Edit {location.location_name}</h1></div><Link href={`/app/${businessSlug}/customers/${customerId}`}>Back to customer</Link></header>
    <section className="workspace-panel"><ServiceLocationForm action={saveServiceLocation.bind(null, businessSlug, customerId, locationId)} location={location} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY : undefined}/></section>
  </section></main>;
}
