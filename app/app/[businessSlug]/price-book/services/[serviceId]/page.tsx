import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceCatalogForm } from "@/components/ServiceCatalogForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../../WorkspaceNav";
import { updateCatalogService } from "../../actions";

export default async function EditCatalogService({
  params, searchParams,
}: {
  params: Promise<{ businessSlug: string; serviceId: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { businessSlug, serviceId } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const { data: service } = await supabase.from("services")
    .select("id,name,description,duration_minutes,price_amount,price_label,recurring_allowed,required_skills,active")
    .eq("id", serviceId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!service) notFound();
  const canEdit = canManageCustomers(role);

  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Price book service</small><h1>{service.name}</h1><p>Edit the service used across booking, jobs, estimates, and recurring plans.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/price-book`}>Back to price book</Link></header>
    {q.success && <div className="workspace-notice success">{q.success}</div>}
    <section className="workspace-panel">{canEdit
      ? <ServiceCatalogForm service={service} action={updateCatalogService.bind(null, businessSlug, service.id)}/>
      : <div className="sv-empty"><h3>View-only access</h3><p>You do not have permission to edit services.</p></div>}
    </section>
  </section></main>;
}
