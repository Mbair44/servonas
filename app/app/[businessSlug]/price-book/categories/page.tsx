import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { archivePriceBookCategory, createPriceBookCategory, updatePriceBookCategory } from "../actions";

export default async function PriceBookCategories({
  params, searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { businessSlug } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const { data: categories, error } = await supabase.from("price_book_categories")
    .select("id,name,description,is_active,is_deleted,sort_order,price_book_items(id,is_active,is_deleted)")
    .eq("business_id", business.id).order("sort_order").order("name");
  if (error) throw new Error("Unable to load price book categories.");
  const canEdit = canManageCustomers(role);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Price book</small><h1>Categories</h1><p>Organize reusable pricing without deleting historical item references.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/price-book`}>Back to price book</Link></header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}{q.success && <div className="workspace-notice success">{q.success}</div>}
    {canEdit && <section className="workspace-panel"><h2>Add category</h2><form action={createPriceBookCategory.bind(null, businessSlug)} className="price-category-create"><label>Name<input required name="name" maxLength={160}/></label><label>Description<input name="description"/></label><label>Sort order<input name="sortOrder" type="number" defaultValue={0}/></label><button className="sv-button">Add category</button></form></section>}
    <section className="workspace-panel"><div className="panel-title"><h2>Categories</h2><span>{categories?.filter((category) => !category.is_deleted).length ?? 0} active records</span></div><div className="price-category-list">
      {(categories ?? []).map((category) => {
        const activeItems = (category.price_book_items ?? []).filter((item) => item.is_active && !item.is_deleted).length;
        return <article key={category.id} className={category.is_deleted ? "archived" : ""}><form action={updatePriceBookCategory.bind(null, businessSlug, category.id)}><label>Name<input name="name" required defaultValue={category.name}/></label><label>Description<input name="description" defaultValue={category.description ?? ""}/></label><label>Sort<input name="sortOrder" type="number" defaultValue={category.sort_order}/></label><label className="price-book-toggle"><input name="isActive" type="checkbox" defaultChecked={category.is_active}/><span>Active</span></label><span>{activeItems} active item{activeItems === 1 ? "" : "s"}</span>{canEdit && !category.is_deleted && <button className="text-button">Save</button>}</form>{canEdit && !category.is_deleted && <form action={archivePriceBookCategory.bind(null, businessSlug, category.id)}><button className="text-button danger">Archive</button></form>}</article>;
      })}
      {!categories?.length && <div className="sv-empty"><h3>No categories</h3><p>Add one to organize your price book.</p></div>}
    </div></section>
  </section></main>;
}
