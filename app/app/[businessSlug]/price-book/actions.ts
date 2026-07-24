"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { parseCurrencyToCents, priceBookUnitTypes } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";

export type PriceBookActionState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const valuesFrom = (formData: FormData) => Object.fromEntries(
  [...formData.entries()].filter(([, value]) => typeof value === "string"),
) as Record<string, string>;

async function prepare(formData: FormData, context: Awaited<ReturnType<typeof requireWorkspace>>) {
  const values = valuesFrom(formData);
  const errors: Record<string, string> = {};
  const name = text(formData, "name");
  const unitType = text(formData, "unitType");
  const price = parseCurrencyToCents(text(formData, "defaultUnitPrice"));
  const cost = parseCurrencyToCents(text(formData, "internalCost"));
  const durationRaw = text(formData, "estimatedDurationMinutes");
  const duration = durationRaw ? Number(durationRaw) : null;
  if (!name || name.length > 160) errors.name = "Enter a name under 160 characters.";
  if (!priceBookUnitTypes.includes(unitType as typeof priceBookUnitTypes[number])) errors.unitType = "Choose a valid unit type.";
  if (price === null) errors.defaultUnitPrice = "Enter a valid non-negative price with no more than two decimals.";
  if (cost === null) errors.internalCost = "Enter a valid non-negative cost with no more than two decimals.";
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 10080)) errors.estimatedDurationMinutes = "Enter a duration from 1 to 10,080 minutes.";
  const categoryId = text(formData, "categoryId") || null;
  const serviceId = text(formData, "serviceId") || null;
  const [{ data: category }, { data: service }] = await Promise.all([
    categoryId ? context.supabase.from("price_book_categories").select("id").eq("id", categoryId).eq("business_id", context.business.id).eq("is_deleted", false).maybeSingle() : Promise.resolve({ data: null }),
    serviceId ? context.supabase.from("services").select("id").eq("id", serviceId).eq("business_id", context.business.id).eq("is_deleted", false).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (categoryId && !category) errors.categoryId = "Category does not belong to this business.";
  if (serviceId && !service) errors.serviceId = "Service does not belong to this business.";
  if (Object.keys(errors).length) return { error: "Please correct the highlighted fields.", errors, values };
  return { values, payload: {
    name,
    description: text(formData, "description") || null,
    internal_description: text(formData, "internalDescription") || null,
    category_id: categoryId,
    service_id: serviceId,
    sku: text(formData, "sku") || null,
    unit_type: unitType,
    default_unit_price_cents: price!,
    internal_cost_cents: cost!,
    currency: "USD",
    is_taxable: formData.get("isTaxable") === "on",
    is_active: formData.get("isActive") === "on",
    sort_order: Number(text(formData, "sortOrder") || 0),
    estimated_duration_minutes: duration,
  } };
}

export async function createPriceBookItem(slug: string, _state: PriceBookActionState, formData: FormData): Promise<PriceBookActionState> {
  const context = await requireWorkspace(slug);
  if (!canManageCustomers(context.role)) return { error: "You do not have permission to manage the price book.", values: valuesFrom(formData) };
  const prepared = await prepare(formData, context);
  if (!("payload" in prepared)) return { error: prepared.error, fieldErrors: prepared.errors, values: prepared.values };
  const { data, error } = await context.supabase.from("price_book_items").insert({
    ...prepared.payload, business_id: context.business.id, created_by: context.user.id, updated_by: context.user.id,
  }).select("id").single();
  if (error || !data) {
    console.error("Price book item creation failed", { code: error?.code, businessId: context.business.id });
    return { error: error?.code === "23505" ? "That SKU or item name is already in use." : "The price book item could not be created.", values: prepared.values };
  }
  revalidatePath(`/app/${slug}/price-book`);
  redirect(`/app/${slug}/price-book/${data.id}?success=Item+created`);
}

export async function updatePriceBookItem(slug: string, itemId: string, _state: PriceBookActionState, formData: FormData): Promise<PriceBookActionState> {
  const context = await requireWorkspace(slug);
  if (!canManageCustomers(context.role)) return { error: "You do not have permission to manage the price book.", values: valuesFrom(formData) };
  const prepared = await prepare(formData, context);
  if (!("payload" in prepared)) return { error: prepared.error, fieldErrors: prepared.errors, values: prepared.values };
  const { error } = await context.supabase.from("price_book_items").update({
    ...prepared.payload, updated_by: context.user.id,
  }).eq("id", itemId).eq("business_id", context.business.id).eq("is_deleted", false);
  if (error) {
    console.error("Price book item update failed", { code: error.code, businessId: context.business.id, itemId });
    return { error: error.code === "23505" ? "That SKU is already in use." : "The price book item could not be saved.", values: prepared.values };
  }
  revalidatePath(`/app/${slug}/price-book`);
  redirect(`/app/${slug}/price-book/${itemId}?success=Item+updated`);
}

export async function setPriceBookItemArchived(slug: string, itemId: string, archived: boolean) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/price-book?error=Permission+denied`);
  const { error } = await supabase.from("price_book_items").update({
    is_deleted: archived, is_active: !archived, updated_by: user.id,
  }).eq("id", itemId).eq("business_id", business.id);
  if (error) {
    console.error("Price book archive change failed", { code: error.code, businessId: business.id, itemId });
    redirect(`/app/${slug}/price-book?error=Item+status+could+not+be+updated`);
  }
  revalidatePath(`/app/${slug}/price-book`);
  redirect(`/app/${slug}/price-book?success=${archived ? "Item+archived" : "Item+restored"}`);
}

export async function duplicatePriceBookItem(slug: string, itemId: string) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/price-book?error=Permission+denied`);
  const { data: source } = await supabase.from("price_book_items").select("*").eq("id", itemId).eq("business_id", business.id).maybeSingle();
  if (!source) redirect(`/app/${slug}/price-book?error=Item+not+found`);
  const { id: _id, created_at: _created, updated_at: _updated, ...copy } = source;
  void _id; void _created; void _updated;
  const { data, error } = await supabase.from("price_book_items").insert({
    ...copy, name: `${source.name} (copy)`, sku: null, is_deleted: false,
    created_by: user.id, updated_by: user.id,
  }).select("id").single();
  if (error || !data) redirect(`/app/${slug}/price-book?error=Item+could+not+be+duplicated`);
  revalidatePath(`/app/${slug}/price-book`);
  redirect(`/app/${slug}/price-book/${data.id}?success=Item+duplicated`);
}

export async function createPriceBookCategory(slug: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/price-book/categories?error=Permission+denied`);
  const name = text(formData, "name");
  if (!name || name.length > 160) redirect(`/app/${slug}/price-book/categories?error=Enter+a+valid+category+name`);
  const { error } = await supabase.from("price_book_categories").insert({
    business_id: business.id, name, description: text(formData, "description") || null,
    sort_order: Number(text(formData, "sortOrder") || 0), created_by: user.id, updated_by: user.id,
  });
  if (error) redirect(`/app/${slug}/price-book/categories?error=${error.code === "23505" ? "Category+name+already+exists" : "Category+could+not+be+created"}`);
  revalidatePath(`/app/${slug}/price-book/categories`);
  redirect(`/app/${slug}/price-book/categories?success=Category+created`);
}

export async function updatePriceBookCategory(slug: string, categoryId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/price-book/categories?error=Permission+denied`);
  const name = text(formData, "name");
  const { error } = await supabase.from("price_book_categories").update({
    name, description: text(formData, "description") || null,
    sort_order: Number(text(formData, "sortOrder") || 0),
    is_active: formData.get("isActive") === "on", updated_by: user.id,
  }).eq("id", categoryId).eq("business_id", business.id).eq("is_deleted", false);
  if (error || !name) redirect(`/app/${slug}/price-book/categories?error=Category+could+not+be+updated`);
  revalidatePath(`/app/${slug}/price-book/categories`);
  redirect(`/app/${slug}/price-book/categories?success=Category+updated`);
}

export async function archivePriceBookCategory(slug: string, categoryId: string) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/price-book/categories?error=Permission+denied`);
  const { count } = await supabase.from("price_book_items").select("id", { count: "exact", head: true })
    .eq("business_id", business.id).eq("category_id", categoryId).eq("is_deleted", false).eq("is_active", true);
  if (count) redirect(`/app/${slug}/price-book/categories?error=Archive+or+move+active+items+before+archiving+this+category`);
  const { error } = await supabase.from("price_book_categories").update({
    is_deleted: true, is_active: false, updated_by: user.id,
  }).eq("id", categoryId).eq("business_id", business.id);
  if (error) redirect(`/app/${slug}/price-book/categories?error=Category+could+not+be+archived`);
  revalidatePath(`/app/${slug}/price-book/categories`);
  redirect(`/app/${slug}/price-book/categories?success=Category+archived`);
}
