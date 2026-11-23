import type { SupabaseClient } from "@supabase/supabase-js";
export type ManualBookingAllowance = { allowed: boolean; usageId: string | null; remaining: number | null; reason: string | null };
export async function claimManualBookingAllowance(supabase: SupabaseClient, input: { businessId: string; requestKey: string; actorUserId: string }): Promise<ManualBookingAllowance> {
  const { data, error } = await supabase.rpc("claim_manual_booking_allowance", { p_business_id: input.businessId, p_request_key: input.requestKey, p_actor_user_id: input.actorUserId });
  if (error?.code === "PGRST202" || error?.code === "42883") return { allowed: true, usageId: null, remaining: null, reason: "legacy_schema" };
  if (error) throw new Error(`Manual booking allowance could not be checked (${error.code}).`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row?.allowed === true, usageId: row?.usage_id ?? null, remaining: row?.remaining ?? null, reason: row?.reason ?? null };
}
export async function finalizeManualBookingAllowance(supabase: SupabaseClient, input: { usageId: string | null; bookingId?: string; failed?: boolean }) {
  if (!input.usageId) return;
  const { error } = await supabase.rpc("finalize_manual_booking_allowance", { p_usage_id: input.usageId, p_booking_id: input.bookingId ?? null, p_failed: input.failed === true });
  if (error && error.code !== "PGRST202" && error.code !== "42883") throw new Error(`Manual booking allowance could not be finalized (${error.code}).`);
}
