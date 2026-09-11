export type RentalInventoryPerformance = {
  lifetimeRevenueCents: number;
  paidRentals: number;
  averageRevenueCents: number | null;
  breakEvenPercent: number | null;
  progressPercent: number | null;
  remainingCents: number | null;
  revenueAboveCostCents: number | null;
  paidForItself: boolean;
};

export function rentalInventoryPerformance(input: {
  purchaseCostCents: number | null | undefined;
  lifetimeRevenueCents: number | null | undefined;
  paidRentals: number | null | undefined;
}): RentalInventoryPerformance {
  const lifetimeRevenueCents = Math.max(0, Math.round(Number(input.lifetimeRevenueCents) || 0));
  const paidRentals = Math.max(0, Math.trunc(Number(input.paidRentals) || 0));
  const purchaseCost = input.purchaseCostCents == null ? null : Math.max(0, Math.round(Number(input.purchaseCostCents) || 0));
  const hasPurchaseCost = purchaseCost !== null && purchaseCost > 0;
  const paidForItself = hasPurchaseCost && lifetimeRevenueCents >= purchaseCost;

  return {
    lifetimeRevenueCents,
    paidRentals,
    averageRevenueCents: paidRentals > 0 ? Math.round(lifetimeRevenueCents / paidRentals) : null,
    breakEvenPercent: hasPurchaseCost ? Math.round((lifetimeRevenueCents / purchaseCost) * 100) : null,
    progressPercent: hasPurchaseCost ? Math.min(100, (lifetimeRevenueCents / purchaseCost) * 100) : null,
    remainingCents: hasPurchaseCost ? Math.max(purchaseCost - lifetimeRevenueCents, 0) : null,
    revenueAboveCostCents: hasPurchaseCost ? Math.max(lifetimeRevenueCents - purchaseCost, 0) : null,
    paidForItself,
  };
}
