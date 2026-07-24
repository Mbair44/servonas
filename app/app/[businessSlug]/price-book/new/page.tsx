import Link from "next/link";
import PriceBookForm from "@/components/PriceBookForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { createPriceBookItem } from "../actions";

export default async function NewPriceBookItem({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">You do not have permission to manage the price book.</div></section></main>;
  const [{ data: categories }, { data: services }] = await Promise.all([
    supabase.from("price_book_categories").select("id,name").eq("business_id", business.id).eq("is_deleted", false).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("services").select("id,name").eq("business_id", business.id).eq("is_deleted", false).eq("active", true).order("name"),
  ]);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Price book</small><h1>Add item</h1><p>Create reusable pricing for future estimates and invoices.</p></div><Link href={`/app/${businessSlug}/price-book`}>Back to price book</Link></header>
    <section className="workspace-panel"><PriceBookForm action={createPriceBookItem.bind(null, businessSlug)} categories={categories ?? []} services={services ?? []} submitLabel="Create item"/></section>
  </section></main>;
}
