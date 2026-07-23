import Link from "next/link";
import { WorkspaceNav } from "../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageCustomers } from "@/lib/access";

const pageSize = 25;
const cleanSearch = (value: string) => value.toLowerCase().trim();

export default async function Customers({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const search = cleanSearch(q.q ?? "");
  const status = q.status === "inactive" ? "inactive" : q.status === "all" ? "all" : "active";
  const sort = ["name", "newest", "recent_job"].includes(q.sort ?? "") ? q.sort! : "name";
  const page = Math.max(1, Number(q.page) || 1);
  const { data: customers, error } = await supabase.from("customers")
    .select("id,first_name,last_name,company_name,email,phone,is_active,created_at")
    .eq("business_id", business.id).eq("is_deleted", false).limit(1000);
  if (error) throw new Error("Unable to load customers.");
  const ids = (customers ?? []).map((customer) => customer.id);
  const [locationsResult, jobsResult] = ids.length ? await Promise.all([
    supabase.from("service_locations").select("id,customer_id,location_name,street_address,city,state,is_primary")
      .eq("business_id", business.id).eq("is_deleted", false).in("customer_id", ids),
    supabase.from("jobs").select("id,customer_id,starts_at,status").eq("business_id", business.id)
      .eq("is_deleted", false).in("customer_id", ids).order("starts_at", { ascending: false, nullsFirst: false }),
  ]) : [{ data: [] }, { data: [] }];
  const locations = locationsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const rows = (customers ?? []).map((customer) => {
    const customerLocations = locations.filter((location) => location.customer_id === customer.id);
    const customerJobs = jobs.filter((job) => job.customer_id === customer.id);
    const primary = customerLocations.find((location) => location.is_primary) ?? customerLocations[0];
    return { ...customer, primary, jobCount: customerJobs.length, lastService: customerJobs[0]?.starts_at ?? null };
  }).filter((customer) => {
    if (status !== "all" && customer.is_active !== (status === "active")) return false;
    if (!search) return true;
    return [
      customer.first_name, customer.last_name, customer.company_name, customer.email, customer.phone,
      customer.primary?.street_address, customer.primary?.city, customer.primary?.state,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
  }).sort((a, b) => {
    if (sort === "newest") return b.created_at.localeCompare(a.created_at);
    if (sort === "recent_job") return String(b.lastService ?? "").localeCompare(String(a.lastService ?? ""));
    return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize);
  const canEdit = canManageCustomers(role);
  const pageHref = (target: number) => {
    const query = new URLSearchParams({ q: q.q ?? "", status, sort, page: String(target) });
    return `/app/${businessSlug}/customers?${query}`;
  };

  return <main className="epic3-shell">
    <WorkspaceNav slug={businessSlug} name={business.name}/>
    <section className="epic3-content">
      <header className="epic3-header"><div><small>Customer CRM</small><h1>Customers</h1><p>Contacts, service locations, and job history in one place.</p></div>{canEdit && <Link className="sv-button" href={`/app/${businessSlug}/customers/new`}>Add customer</Link>}</header>
      {q.error && <div className="workspace-notice error">{q.error}</div>}
      {q.success && <div className="workspace-notice success">{q.success}</div>}
      <form className="crm-toolbar">
        <label>Search<input name="q" defaultValue={q.q ?? ""} placeholder="Name, company, email, phone, or address"/></label>
        <label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></label>
        <label>Sort<select name="sort" defaultValue={sort}><option value="name">Name</option><option value="newest">Newest</option><option value="recent_job">Most recent job</option></select></label>
        <button className="sv-button sv-secondary">Apply</button>
      </form>
      <section className="workspace-panel">
        <div className="panel-title"><h2>Customer list</h2><span>{rows.length} customer{rows.length === 1 ? "" : "s"}</span></div>
        <div className="crm-customer-list">
          {visible.length ? visible.map((customer) => <Link href={`/app/${businessSlug}/customers/${customer.id}`} key={customer.id} className="crm-customer-row">
            <div><strong>{customer.first_name} {customer.last_name}</strong><span>{customer.company_name || "Residential customer"}</span></div>
            <div><b>{customer.phone || "No phone"}</b><span>{customer.email || "No email"}</span></div>
            <div><b>{customer.primary?.location_name || "No location"}</b><span>{customer.primary ? `${customer.primary.city}, ${customer.primary.state}` : "Add a service location"}</span></div>
            <div><b>{customer.jobCount} job{customer.jobCount === 1 ? "" : "s"}</b><span>{customer.lastService ? `Last: ${new Date(customer.lastService).toLocaleDateString()}` : "No service history"}</span></div>
            <span className={`crm-status ${customer.is_active ? "active" : "inactive"}`}>{customer.is_active ? "Active" : "Inactive"}</span>
          </Link>) : <div className="sv-empty"><h3>No matching customers</h3><p>Adjust the filters or add a customer.</p></div>}
        </div>
        {totalPages > 1 && <nav className="crm-pagination" aria-label="Customer pages">
          {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span/>}
          <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
          {page < totalPages ? <Link href={pageHref(page + 1)}>Next</Link> : <span/>}
        </nav>}
      </section>
    </section>
  </main>;
}
