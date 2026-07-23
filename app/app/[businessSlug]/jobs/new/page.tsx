import Link from "next/link";
import JobForm from "@/components/JobForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { createJob } from "../actions";

export default async function NewJob({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<{ customerId?: string }> }) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">You do not have permission to create jobs.</div></section></main>;
  const [{ data: customers }, { data: locations }, { data: services }, { data: technicians }] = await Promise.all([
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id", business.id).eq("is_deleted", false).eq("is_active", true).order("last_name"),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address,city,state").eq("business_id", business.id).eq("is_deleted", false).eq("is_active", true).order("location_name"),
    supabase.from("services").select("id,name,duration_minutes").eq("business_id", business.id).eq("is_deleted", false).eq("active", true).order("name"),
    supabase.from("technician_profiles").select("id,display_name").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).order("display_name"),
  ]);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Field service operations</small><h1>Add job</h1><p>All scheduling times are shown in {business.timezone}. Need a new customer? <Link href={`/app/${businessSlug}/customers/new`}>Create one first</Link>.</p></div><Link href={`/app/${businessSlug}/jobs`}>Back to jobs</Link></header>
    <section className="workspace-panel"><JobForm action={createJob.bind(null, businessSlug)} customers={customers ?? []} locations={locations ?? []} services={services ?? []} technicians={technicians ?? []} submitLabel="Create job" defaultCustomerId={query.customerId}/></section>
  </section></main>;
}
