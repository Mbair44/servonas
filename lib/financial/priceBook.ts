export const priceBookUnitTypes = [
  "each", "hour", "day", "visit", "foot", "square_foot", "flat_rate", "custom",
] as const;
export type PriceBookUnitType = typeof priceBookUnitTypes[number];

export function parseCurrencyToCents(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCents(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value / 100);
}

export function marginPercent(priceCents: number, costCents: number) {
  if (priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) * 10_000) / priceCents) / 100;
}
