export function googleAdsBidDollarsToMicros(value: unknown) {
 const dollars = typeof value === "string" ? value.trim() : "";
 if (!/^\d+(?:\.\d{1,2})?$/.test(dollars)) return null;
 const numeric = Number(dollars);
 return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 1_000_000) : null;
}
