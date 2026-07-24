import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { formatCents } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";

const statuses = ["draft","sent","viewed","accepted","declined","expired","converted","void"];
export default async function EstimatesPage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<Record<string,string|undefined>> }) {
  const { businessSlug } = await params; const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  let query = supabase.from("estimates").select("id,estimate_number,title,status,grand_total_cents,currency,issue_date,expiration_date,created_at,customers!estimates_customer_fk(first_name,last_name,company_name)")
    .eq("business_id", business.id).eq("is_deleted", false);
  if (q.status && q.status !== "all") query = query.eq("status", q.status);
  if (q.customerId) query = query.eq("customer_id", q.customerId);
  if (q.q) query = query.or(`estimate_number.ilike.%${q.q.replaceAll(",", "")}%,title.ilike.%${q.q.replaceAll(",", "")}%`);
  if (q.from) query = query.gte("created_at", `${q.from}T00:00:00Z`);
  if (q.to) query = query.lte("created_at", `${q.to}T23:59:59Z`);
  const [{ data: estimates, error }, { data: customers }] = await Promise.all([
    query.order("created_at", { ascending: false }),
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id", business.id).eq("is_deleted", false).order("last_name"),
  ]);
  if (error) throw new Error("Estimates could not be loaded.");
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Sales workflow</small><h1>Estimates</h1><p>Create, revise, send, and convert customer proposals.</p></div>{canManageCustomers(role) && <Link className="sv-button" href={`/app/${businessSlug}/estimates/new`}>New estimate</Link>}</header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}{q.success && <div className="workspace-notice success">{q.success}</div>}
    <section className="workspace-panel"><form className="estimate-toolbar"><label>Search<input name="q" defaultValue={q.q} placeholder="Number or title"/></label><label>Status<select name="status" defaultValue={q.status ?? "all"}><option value="all">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Customer<select name="customerId" defaultValue={q.customerId ?? ""}><option value="">All customers</option>{customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || `${customer.first_name} ${customer.last_name}`}</option>)}</select></label><label>From<input name="from" type="date" defaultValue={q.from}/></label><label>To<input name="to" type="date" defaultValue={q.to}/></label><button className="sv-button">Filter</button></form></section>
    <section className="workspace-panel"><div className="panel-title"><h2>Estimate list</h2><span>{estimates?.length ?? 0} estimates</span></div><div className="estimate-list">{estimates?.length ? estimates.map((estimate) => {
      const customer = Array.isArray(estimate.customers) ? estimate.customers[0] : estimate.customers;
      return <Link key={estimate.id} href={`/app/${businessSlug}/estimates/${estimate.id}`}><div><span className={`estimate-status ${estimate.status}`}>{estimate.status}</span><strong>{estimate.estimate_number} · {estimate.title}</strong><small>{customer?.company_name || `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim()}</small></div><div><strong>{formatCents(estimate.grand_total_cents, estimate.currency)}</strong><small>{estimate.expiration_date ? `Expires ${estimate.expiration_date}` : "No expiration"}</small></div></Link>;
    }) : <div className="sv-empty"><h3>No estimates found</h3><p>Create a draft or adjust the filters.</p></div>}</div></section>
  </section></main>;
}
