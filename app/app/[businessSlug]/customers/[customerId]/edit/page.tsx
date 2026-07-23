import Link from "next/link";
import { notFound } from "next/navigation";
import CustomerCrmForm from "@/components/CustomerCrmForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../../WorkspaceNav";
import { updateCustomer } from "../../actions";

export default async function EditCustomer({ params }: { params: Promise<{ businessSlug: string; customerId: string }> }) {
  const { businessSlug, customerId } = await params;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!customer) notFound();
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">You do not have permission to edit this customer.</div></section></main>;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Customer CRM</small><h1>Edit {customer.first_name} {customer.last_name}</h1></div><Link href={`/app/${businessSlug}/customers/${customerId}`}>Back to customer</Link></header>
    <section className="workspace-panel"><CustomerCrmForm action={updateCustomer.bind(null, businessSlug, customerId)} customer={customer} submitLabel="Save customer"/></section>
  </section></main>;
}
