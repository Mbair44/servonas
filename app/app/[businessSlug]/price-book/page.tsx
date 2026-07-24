import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { formatCents, marginPercent } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import { setPriceBookItemArchived } from "./actions";

export default async function PriceBookPage({
  params, searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const search = (q.q ?? "").trim().toLowerCase();
  const status = ["active", "inactive", "archived", "all"].includes(q.status ?? "") ? q.status! : "active";
  const category = q.category ?? "";
  const sort = ["name", "price_low", "price_high", "margin"].includes(q.sort ?? "") ? q.sort! : "name";
  const [{ data: items, error }, { data: categories }] = await Promise.all([
    supabase.from("price_book_items")
      .select("id,name,description,sku,unit_type,default_unit_price_cents,internal_cost_cents,currency,is_taxable,is_active,is_deleted,category_id,price_book_categories(name)")
      .eq("business_id", business.id).limit(1000),
    supabase.from("price_book_categories").select("id,name").eq("business_id", business.id).eq("is_deleted", false).order("sort_order").order("name"),
  ]);
  if (error) throw new Error("Unable to load the price book.");
  const rows = (items ?? []).filter((item) => {
    if (status === "active" && (!item.is_active || item.is_deleted)) return false;
    if (status === "inactive" && (item.is_active || item.is_deleted)) return false;
    if (status === "archived" && !item.is_deleted) return false;
    if (category && item.category_id !== category) return false;
    if (search && ![item.name, item.description, item.sku].some((value) => value?.toLowerCase().includes(search))) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "price_low") return a.default_unit_price_cents - b.default_unit_price_cents;
    if (sort === "price_high") return b.default_unit_price_cents - a.default_unit_price_cents;
    if (sort === "margin") return (marginPercent(b.default_unit_price_cents, b.internal_cost_cents) ?? -Infinity) - (marginPercent(a.default_unit_price_cents, a.internal_cost_cents) ?? -Infinity);
    return a.name.localeCompare(b.name);
  });
  const canEdit = canManageCustomers(role);

  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Billing foundation</small><h1>Price book</h1><p>Reusable services, labor, material, and fee pricing.</p></div>{canEdit && <div className="crm-header-actions"><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/price-book/categories`}>Categories</Link><Link className="sv-button" href={`/app/${businessSlug}/price-book/new`}>Add item</Link></div>}</header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}{q.success && <div className="workspace-notice success">{q.success}</div>}
    <form className="price-book-toolbar">
      <label>Search<input name="q" defaultValue={q.q ?? ""} placeholder="Name, description, or SKU"/></label>
      <label>Category<select name="category" defaultValue={category}><option value="">All categories</option>{(categories ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option><option value="all">All</option></select></label>
      <label>Sort<select name="sort" defaultValue={sort}><option value="name">Name</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="margin">Highest margin</option></select></label>
      <button className="sv-button sv-secondary">Apply</button>
    </form>
    <section className="workspace-panel"><div className="panel-title"><h2>Items</h2><span>{rows.length} result{rows.length === 1 ? "" : "s"}</span></div>
      <div className="price-book-list">{rows.length ? rows.map((item) => {
        const relation = Array.isArray(item.price_book_categories) ? item.price_book_categories[0] : item.price_book_categories;
        const margin = marginPercent(item.default_unit_price_cents, item.internal_cost_cents);
        return <article key={item.id}>
          <Link href={`/app/${businessSlug}/price-book/${item.id}`}><div><small>{relation?.name ?? "Uncategorized"}{item.sku ? ` · ${item.sku}` : ""}</small><strong>{item.name}</strong><span>{item.description || "No description"}</span></div><div><strong>{formatCents(item.default_unit_price_cents, item.currency)}</strong><span>per {item.unit_type.replaceAll("_", " ")}</span></div><div><strong>{formatCents(item.internal_cost_cents, item.currency)}</strong><span>cost · {margin === null ? "—" : `${margin.toFixed(2)}%`} margin</span></div><span className={`crm-status ${item.is_active && !item.is_deleted ? "active" : "inactive"}`}>{item.is_deleted ? "Archived" : item.is_active ? "Active" : "Inactive"}</span></Link>
          {canEdit && <form action={setPriceBookItemArchived.bind(null, businessSlug, item.id, !item.is_deleted)}><button className="text-button">{item.is_deleted ? "Restore" : "Archive"}</button></form>}
        </article>;
      }) : <div className="sv-empty"><h3>No price book items</h3><p>Adjust the filters or add your first reusable item.</p></div>}</div>
    </section>
  </section></main>;
}
