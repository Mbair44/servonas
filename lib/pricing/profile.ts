import type { SupabaseClient } from "@supabase/supabase-js";
import { isPricingPlanKey, type PricingPlanKey } from "./catalog.ts";

export type PricingProfile = { planKey: PricingPlanKey; billingAnchorAt: string | null; rolloutEnabled: boolean };
const legacyProfile: PricingProfile = { planKey: "legacy", billingAnchorAt: null, rolloutEnabled: false };

/** Missing Phase B tables deliberately mean legacy access, never a feature shutoff. */
export async function getPricingProfile(supabase: SupabaseClient, businessId: string): Promise<PricingProfile> {
  const { data, error } = await supabase.from("business_pricing_profiles").select("plan_key,billing_anchor_at,rollout_enabled").eq("business_id", businessId).maybeSingle();
  if (error) { console.warn("Pricing profile lookup defaulted to legacy", { businessId, code: error.code }); return legacyProfile; }
  if (!data || !isPricingPlanKey(data.plan_key)) return legacyProfile;
  return { planKey: data.plan_key, billingAnchorAt: data.billing_anchor_at ?? null, rolloutEnabled: data.rollout_enabled === true };
}
