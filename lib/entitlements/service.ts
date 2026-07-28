import type { SupabaseClient } from "@supabase/supabase-js";
import type { CapabilityCode } from "./catalog";
import { entitlementCatalog, isEntitlementCode } from "./catalog";
import { effectiveStatus, evaluateCapability, type EntitlementRecord } from "./evaluate";
import { EntitlementAccessError, EntitlementEvaluationError } from "./errors";

export type CurrentEntitlement = EntitlementRecord & {
  business_id: string;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EntitlementSummary = {
  entitlement: CurrentEntitlement | null;
  effectiveStatus: ReturnType<typeof effectiveStatus> | null;
  name: string | null;
  capabilities: readonly CapabilityCode[];
  limits: Readonly<Record<string, number | boolean | null>>;
};

const currentStates = new Set(["scheduled", "active", "grace_period"]);

export async function getCurrentEntitlement(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CurrentEntitlement | null> {
  const { data, error } = await supabase
    .from("business_entitlements")
    .select("id,business_id,entitlement_key,status,source,starts_at,ends_at,grace_period_ends_at,version,metadata,created_at,updated_at")
    .eq("business_id", businessId)
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("Entitlement evaluation query failed", {
      businessId,
      code: error.code,
    });
    throw new EntitlementEvaluationError(error.code);
  }

  const rows = (data ?? []) as CurrentEntitlement[];
  return rows.find((row) => currentStates.has(row.status)) ?? rows[0] ?? null;
}

export async function getEntitlementSummary(
  supabase: SupabaseClient,
  businessId: string,
  at = new Date(),
): Promise<EntitlementSummary> {
  const entitlement = await getCurrentEntitlement(supabase, businessId);
  if (!entitlement) {
    return { entitlement: null, effectiveStatus: null, name: null, capabilities: [], limits: {} };
  }
  const code = isEntitlementCode(entitlement.entitlement_key) ? entitlement.entitlement_key : null;
  const definition = code ? entitlementCatalog[code] : null;
  return {
    entitlement,
    effectiveStatus: effectiveStatus(entitlement, at),
    name: definition?.name ?? null,
    capabilities: definition?.capabilities ?? [],
    limits: definition?.limits ?? {},
  };
}

export async function getCapabilityAccess(
  supabase: SupabaseClient,
  businessId: string,
  capability: CapabilityCode,
  options: { at?: Date; currentUsage?: number | null } = {},
) {
  const entitlement = await getCurrentEntitlement(supabase, businessId);
  return evaluateCapability(
    entitlement,
    capability,
    options.at ?? new Date(),
    options.currentUsage ?? null,
  );
}

export async function canAccess(
  supabase: SupabaseClient,
  businessId: string,
  capability: CapabilityCode,
) {
  return (await getCapabilityAccess(supabase, businessId, capability)).allowed;
}

export async function assertCanAccess(
  supabase: SupabaseClient,
  businessId: string,
  capability: CapabilityCode,
) {
  const access = await getCapabilityAccess(supabase, businessId, capability);
  if (!access.allowed) {
    console.warn("Entitlement capability access denied", {
      businessId,
      capability,
      reason: access.reason,
      entitlementCode: access.entitlementCode,
      entitlementStatus: access.entitlementStatus,
    });
    throw new EntitlementAccessError(access);
  }
  return access;
}

export async function getTenantLimits(supabase: SupabaseClient, businessId: string) {
  return (await getEntitlementSummary(supabase, businessId)).limits;
}

export async function getLimit(
  supabase: SupabaseClient,
  businessId: string,
  limitCode: string,
) {
  const limits = await getTenantLimits(supabase, businessId);
  return limits[limitCode] ?? null;
}

export async function canConsume(
  supabase: SupabaseClient,
  businessId: string,
  limitCode: string,
  currentUsage: number,
  amount = 1,
) {
  const limit = await getLimit(supabase, businessId, limitCode);
  return typeof limit !== "number" || currentUsage + amount <= limit;
}
