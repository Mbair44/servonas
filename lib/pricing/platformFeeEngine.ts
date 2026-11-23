import type { SupabaseClient } from "@supabase/supabase-js";
import { getPricingProfile } from "./profile.ts";

export type FeeAllocation = { eligibleAmountCents: number; excludedAmountCents: number; reason: string };
export type PlatformFeePreparation = { enabled: false; applicationFeeCents: 0; reservationId: null } | { enabled: true; applicationFeeCents: number; reservationId: string };

/** Collection is test-mode only until an explicit Phase C review enables it. */
export function platformFeeCollectionEnabled() {
  return process.env.SERVONAS_PLATFORM_FEE_TEST_MODE === "true" && process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true;
}

export function eligibleAllocation(input: { chargedAmountCents: number; tipsCents?: number; refundableSecurityDepositCents?: number; overpaymentCents?: number }): FeeAllocation {
  const excludedAmountCents = (input.tipsCents ?? 0) + (input.refundableSecurityDepositCents ?? 0) + (input.overpaymentCents ?? 0);
  if (![input.chargedAmountCents, excludedAmountCents].every(Number.isSafeInteger) || input.chargedAmountCents < 0 || excludedAmountCents < 0 || excludedAmountCents > input.chargedAmountCents) throw new Error("Payment eligibility allocation is invalid.");
  return { eligibleAmountCents: input.chargedAmountCents - excludedAmountCents, excludedAmountCents, reason: excludedAmountCents ? "mixed_payment_snapshot" : "entire_payment_eligible" };
}

export async function preparePlatformFee(supabase: SupabaseClient, input: { businessId: string; idempotencyKey: string; allocation: FeeAllocation; expiresAt: string }): Promise<PlatformFeePreparation> {
  const profile = await getPricingProfile(supabase, input.businessId);
  if (profile.planKey === "legacy" || !profile.rolloutEnabled || !platformFeeCollectionEnabled()) return { enabled: false, applicationFeeCents: 0, reservationId: null };
  const { data: bounds, error: boundsError } = await supabase.rpc("pricing_billing_cycle_bounds", { p_anchor: profile.billingAnchorAt, p_at: new Date().toISOString() });
  if (boundsError) throw new Error(`Billing cycle could not be resolved (${boundsError.code}).`);
  const bound = Array.isArray(bounds) ? bounds[0] : bounds;
  if (!bound?.cycle_starts_at || !bound?.cycle_ends_at) throw new Error("Billing cycle could not be resolved.");
  const { data, error } = await supabase.rpc("reserve_platform_fee", {
    p_business_id: input.businessId, p_cycle_starts_at: bound.cycle_starts_at, p_cycle_ends_at: bound.cycle_ends_at,
    p_idempotency_key: input.idempotencyKey, p_eligible_amount_cents: input.allocation.eligibleAmountCents, p_expires_at: input.expiresAt,
  });
  if (error) throw new Error(`Platform fee could not be reserved (${error.code}).`);
  const reservation = Array.isArray(data) ? data[0] : data;
  if (!reservation?.reservation_id || !Number.isSafeInteger(Number(reservation.fee_cents))) throw new Error("Platform fee reservation was invalid.");
  return { enabled: true, applicationFeeCents: Number(reservation.fee_cents), reservationId: reservation.reservation_id };
}
