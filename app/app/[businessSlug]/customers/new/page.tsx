import Link from "next/link";
import CustomerCrmForm from "@/components/CustomerCrmForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { createCustomer } from "../actions";

export default async function NewCustomer({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role } = await requireWorkspace(businessSlug);
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">You do not have permission to add customers.</div></section></main>;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Customer CRM</small><h1>Add customer</h1></div><Link href={`/app/${businessSlug}/customers`}>Back to customers</Link></header>
    <section className="workspace-panel"><CustomerCrmForm action={createCustomer.bind(null, businessSlug)} submitLabel="Create customer"/></section>
  </section></main>;
}
