export const pricingPlanKeys = ["legacy", "starter", "growth", "scale"] as const;
export type PricingPlanKey = (typeof pricingPlanKeys)[number];

export const PLATFORM_FEE_BASIS_POINTS = 300;
export const PLATFORM_FEE_MONTHLY_CAP_CENTS = 9_900;
export const STARTER_MANUAL_BOOKING_LIMIT = 10;

export const pricingPlanCatalog = {
  legacy: { monthlyPriceCents: null, manualBookingLimit: null, platformFeeEnabled: false, twilioAllowed: true },
  starter: { monthlyPriceCents: 0, manualBookingLimit: STARTER_MANUAL_BOOKING_LIMIT, platformFeeEnabled: true, twilioAllowed: false },
  growth: { monthlyPriceCents: 5_000, manualBookingLimit: null, platformFeeEnabled: true, twilioAllowed: true },
  scale: { monthlyPriceCents: 15_000, manualBookingLimit: null, platformFeeEnabled: true, twilioAllowed: true },
} as const;

/** Integer half-up rounding; payment inputs are always cents. */
export function percentageFeeCents(eligibleAmountCents: number, basisPoints = PLATFORM_FEE_BASIS_POINTS) {
  if (!Number.isSafeInteger(eligibleAmountCents) || eligibleAmountCents < 0) throw new Error("Eligible amount must be a non-negative integer number of cents.");
  return Math.floor((eligibleAmountCents * basisPoints + 5_000) / 10_000);
}

export function platformFeeCents(eligibleAmountCents: number, remainingCapCents: number) {
  if (!Number.isSafeInteger(remainingCapCents) || remainingCapCents < 0) throw new Error("Remaining cap must be a non-negative integer number of cents.");
  return Math.min(percentageFeeCents(eligibleAmountCents), remainingCapCents);
}

export function isPricingPlanKey(value: string): value is PricingPlanKey {
  return (pricingPlanKeys as readonly string[]).includes(value);
}
