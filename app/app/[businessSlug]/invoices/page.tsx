import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { formatCents } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";

const statuses=["draft","sent","viewed","partially_paid","paid","overdue","void","uncollectible","refunded"];
export default async function InvoicesPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
  let query=supabase.from("invoices").select("id,invoice_number,title,status,grand_total_cents,balance_due_cents,currency,issue_date,due_date,created_at,customers!invoices_customer_fk(first_name,last_name,company_name)")
    .eq("business_id",business.id).eq("is_deleted",false).order("created_at",{ascending:false});
  if(q.status&&statuses.includes(q.status))query=query.eq("status",q.status);
  const {data:invoices,error}=await query;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Billing</small><h1>Invoices</h1><p>Track billing, payments, due dates, and customer balances.</p></div>{canManageCustomers(role)&&<Link className="sv-button" href={`/app/${businessSlug}/invoices/new`}>New invoice</Link>}</header>
    {q.error&&<div className="workspace-notice error">{q.error}</div>}{error&&<div className="workspace-notice error">Invoices could not be loaded. Apply the Checkpoint 6 migration if this continues.</div>}
    <nav className="estimate-filters" aria-label="Invoice status filters"><Link href={`/app/${businessSlug}/invoices`}>All</Link>{statuses.map(status=><Link key={status} href={`/app/${businessSlug}/invoices?status=${status}`}>{status.replaceAll("_"," ")}</Link>)}</nav>
    <section className="estimate-list">{invoices?.length?invoices.map(invoice=>{const customer=Array.isArray(invoice.customers)?invoice.customers[0]:invoice.customers;return <Link key={invoice.id} href={`/app/${businessSlug}/invoices/${invoice.id}`}><div><span className={`estimate-status ${invoice.status}`}>{invoice.status.replaceAll("_"," ")}</span><strong>{invoice.invoice_number} · {invoice.title}</strong><small>{customer?.company_name||`${customer?.first_name??""} ${customer?.last_name??""}`.trim()}</small></div><div><strong>{formatCents(invoice.balance_due_cents,invoice.currency)} due</strong><small>{formatCents(invoice.grand_total_cents,invoice.currency)} total · {invoice.due_date?`Due ${invoice.due_date}`:"No due date"}</small></div></Link>}):<div className="workspace-panel empty-state"><h2>No invoices yet</h2><p>Create a standalone invoice, or convert an estimate or job.</p></div>}</section>
  </section></main>;
}
