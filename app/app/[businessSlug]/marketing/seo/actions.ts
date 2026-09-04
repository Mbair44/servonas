"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";

const pagePath = (slug: string) => `/app/${encodeURIComponent(slug)}/marketing/seo`;
const destination = (slug: string, kind: "success" | "error", message: string) => `${pagePath(slug)}?${kind}=${encodeURIComponent(message)}`;

export async function updateLocalSeoRecommendationState(slug: string, dedupeKey: string, status: "dismissed" | "completed" | "open") {
  const { supabase, business, user, role } = await requireWorkspace(slug);
  if (!canManageBusiness(role)) redirect(destination(slug, "error", "Only owners and administrators can update Local SEO recommendations."));
  const now = new Date().toISOString();
  const row = {
    business_id: business.id,
    dedupe_key: dedupeKey,
    status,
    dismissed_at: status === "dismissed" ? now : null,
    completed_at: status === "completed" ? now : null,
    updated_at: now,
    updated_by: user.id,
  };
  const { error } = await supabase.from("business_local_seo_recommendation_states").upsert(row, { onConflict: "business_id,dedupe_key" });
  if (error) redirect(destination(slug, "error", "Local SEO recommendation storage is not installed yet."));
  revalidatePath(pagePath(slug));
  redirect(destination(slug, "success", status === "dismissed" ? "Recommendation dismissed." : status === "completed" ? "Recommendation marked complete." : "Recommendation reopened."));
}

export async function saveLocalSeoDraft(
  slug: string,
  input: { sourceEntityType: "service" | "inventory_item" | "location"; sourceEntityId: string; targetType: "website_service_page" | "website_location_page"; dedupeKey: string; draft: string },
) {
  const { supabase, business, user, role } = await requireWorkspace(slug);
  if (!canManageBusiness(role)) redirect(destination(slug, "error", "Only owners and administrators can create Local SEO drafts."));
  const draft = JSON.parse(input.draft) as Record<string, unknown>;
  const now = new Date().toISOString();
  const { error: mappingError } = await supabase.from("business_seo_entity_mappings").upsert({
    business_id: business.id,
    source_entity_type: input.sourceEntityType,
    source_entity_id: input.sourceEntityId,
    target_type: input.targetType,
    target_id: typeof draft.slug === "string" ? draft.slug : null,
    status: "draft",
    metadata: draft,
    updated_at: now,
    updated_by: user.id,
  }, { onConflict: "business_id,source_entity_type,source_entity_id,target_type" });
  if (mappingError) redirect(destination(slug, "error", "Local SEO draft storage is not installed yet."));
  const { error: stateError } = await supabase.from("business_local_seo_recommendation_states").upsert({
    business_id: business.id,
    dedupe_key: input.dedupeKey,
    status: "completed",
    completed_at: now,
    updated_at: now,
    updated_by: user.id,
  }, { onConflict: "business_id,dedupe_key" });
  if (stateError) redirect(destination(slug, "error", "Local SEO recommendation state could not be updated."));
  revalidatePath(pagePath(slug));
  redirect(destination(slug, "success", "SEO page draft saved. Servonas stored the brief and metadata for future website publishing."));
}
