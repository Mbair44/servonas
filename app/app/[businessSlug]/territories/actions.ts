"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { splitTerritoryValues, validateTerritory, type TerritoryStrategyConfig } from "@/lib/workforceTerritories";
import { requireWorkspace } from "@/lib/workspace";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const number = (formData: FormData, key: string) => {
  const raw = text(formData, key);
  return raw ? Number(raw) : Number.NaN;
};
const route = (slug: string, kind: "success" | "error", message: string) =>
  `/app/${slug}/territories?${kind}=${encodeURIComponent(message)}`;

function payload(formData: FormData, userId: string) {
  const name = text(formData, "name");
  const territoryType = text(formData, "territoryType") || "mixed";
  const postalCodes = splitTerritoryValues(text(formData, "postalCodes"));
  const neighborhoods = splitTerritoryValues(text(formData, "neighborhoods"));
  const boundary = text(formData, "boundaryGeojson");
  const color = text(formData, "color") || "#4F46E5";
  const description = text(formData, "description");
  const notes = text(formData, "notes");
  const parentTerritoryId = text(formData, "parentTerritoryId");
  const cities = splitTerritoryValues(text(formData, "cities"));
  const radiusLatitude = number(formData, "radiusLatitude");
  const radiusLongitude = number(formData, "radiusLongitude");
  const radiusMiles = number(formData, "radiusMiles");
  const strategyConfig: TerritoryStrategyConfig = {
    ...(cities.length ? { cities } : {}),
    ...(territoryType === "radius" ? {
      center: { latitude: radiusLatitude, longitude: radiusLongitude },
      radius_meters: Math.round(radiusMiles * 1609.344),
    } : {}),
  };
  const error = validateTerritory({
    name, type: territoryType, postalCodes, neighborhoods, boundary, color, description, notes, strategyConfig,
  });
  return {
    error,
    data: {
      name,
      territory_type: territoryType,
      postal_codes: postalCodes,
      neighborhoods,
      boundary_geojson: boundary ? JSON.parse(boundary) : null,
      color,
      description: description || null,
      notes: notes || null,
      parent_territory_id: parentTerritoryId || null,
      strategy_config: strategyConfig,
      updated_by: userId,
    },
  };
}

export async function createTerritory(slug: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageBusiness(role)) redirect(route(slug, "error", "Only owners and administrators can create territories."));
  const parsed = payload(formData, user.id);
  if (parsed.error) redirect(route(slug, "error", parsed.error));
  if (parsed.data.parent_territory_id) {
    const { data: parent } = await supabase.from("workforce_territories").select("id")
      .eq("business_id", business.id).eq("id", parsed.data.parent_territory_id).maybeSingle();
    if (!parent) redirect(route(slug, "error", "The selected parent territory is unavailable."));
  }
  const { error } = await supabase.from("workforce_territories").insert({
    ...parsed.data, business_id: business.id, created_by: user.id,
  });
  if (error) {
    console.error("Territory manager create failed", { businessId: business.id, code: error.code });
    redirect(route(slug, "error", error.code === "23505" ? "A territory with that name already exists." : "The territory could not be created."));
  }
  revalidatePath(`/app/${slug}/territories`);
  redirect(route(slug, "success", "Territory created."));
}

export async function updateTerritory(slug: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageBusiness(role)) redirect(route(slug, "error", "Only owners and administrators can edit territories."));
  const territoryId = text(formData, "territoryId");
  const version = Number(text(formData, "version"));
  const parsed = payload(formData, user.id);
  if (!territoryId || !Number.isSafeInteger(version) || version < 1 || parsed.error) {
    redirect(route(slug, "error", parsed.error || "The territory version is invalid. Refresh and try again."));
  }
  if (parsed.data.parent_territory_id === territoryId) redirect(route(slug, "error", "A territory cannot be its own parent."));
  const { data, error } = await supabase.from("workforce_territories").update(parsed.data)
    .eq("business_id", business.id).eq("id", territoryId).eq("version", version).select("id").maybeSingle();
  if (error) {
    console.error("Territory manager update failed", { businessId: business.id, territoryId, code: error.code });
    redirect(route(slug, "error", error.code === "23505" ? "A territory with that name already exists." : "The territory could not be updated."));
  }
  if (!data) redirect(route(slug, "error", "This territory changed in another session. Refresh before saving."));
  revalidatePath(`/app/${slug}/territories`);
  redirect(route(slug, "success", "Territory updated."));
}

export async function setTerritoryActive(slug: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageBusiness(role)) redirect(route(slug, "error", "Only owners and administrators can change territory status."));
  const territoryId = text(formData, "territoryId");
  const active = text(formData, "active") === "true";
  const { error } = await supabase.from("workforce_territories")
    .update({ is_active: active, updated_by: user.id })
    .eq("business_id", business.id).eq("id", territoryId);
  if (error) {
    console.error("Territory manager status update failed", { businessId: business.id, territoryId, code: error.code });
    redirect(route(slug, "error", "The territory status could not be changed."));
  }
  revalidatePath(`/app/${slug}/territories`);
  redirect(route(slug, "success", active ? "Territory restored." : "Territory archived."));
}
