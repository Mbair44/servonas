import Link from "next/link";
import { notFound } from "next/navigation";
import PriceBookForm from "@/components/PriceBookForm";
import { canManageCustomers } from "@/lib/access";
import { formatCents, marginPercent } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { duplicatePriceBookItem, setPriceBookItemArchived, updatePriceBookItem } from "../actions";

export default async function PriceBookItem({
  params, searchParams,
}: {
  params: Promise<{ businessSlug: string; itemId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { businessSlug, itemId } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const [{ data: item }, { data: categories }, { data: services }] = await Promise.all([
    supabase.from("price_book_items").select("*").eq("id", itemId).eq("business_id", business.id).maybeSingle(),
    supabase.from("price_book_categories").select("id,name").eq("business_id", business.id).eq("is_deleted", false).order("sort_order").order("name"),
    supabase.from("services").select("id,name").eq("business_id", business.id).eq("is_deleted", false).eq("active", true).order("name"),
  ]);
  if (!item) notFound();
  const canEdit = canManageCustomers(role);
  const margin = marginPercent(item.default_unit_price_cents, item.internal_cost_cents);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Price book item</small><h1>{item.name}</h1><p>{formatCents(item.default_unit_price_cents, item.currency)} per {item.unit_type.replaceAll("_", " ")} · {margin === null ? "No margin" : `${margin.toFixed(2)}% margin`}</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/price-book`}>Back</Link>{canEdit && <form action={duplicatePriceBookItem.bind(null, businessSlug, item.id)}><button className="sv-button sv-secondary">Duplicate</button></form>}{canEdit && <form action={setPriceBookItemArchived.bind(null, businessSlug, item.id, !item.is_deleted)}><button className={`sv-button ${item.is_deleted ? "" : "sv-danger"}`}>{item.is_deleted ? "Restore" : "Archive"}</button></form>}</div></header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}{q.success && <div className="workspace-notice success">{q.success}</div>}
    <section className="workspace-panel">{canEdit ? <PriceBookForm action={updatePriceBookItem.bind(null, businessSlug, item.id)} categories={categories ?? []} services={services ?? []} item={item} submitLabel="Save item"/> : <div className="sv-empty"><h3>View-only access</h3><p>You do not have permission to edit pricing.</p></div>}</section>
  </section></main>;
}
