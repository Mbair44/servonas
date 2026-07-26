export const DOCUMENTED_FALLBACK_SERVICE_DURATION_MINUTES = 60;

export type ServiceDurationSource = "job" | "service" | "price_book" | "business_default" | "documented_fallback";

export function resolveServiceDuration({
  jobMinutes, serviceMinutes, priceBookMinutes, businessDefaultMinutes,
}: {
  jobMinutes?: number | null; serviceMinutes?: number | null; priceBookMinutes?: number | null; businessDefaultMinutes?: number | null;
}): { minutes: number; source: ServiceDurationSource } {
  const candidates: Array<[number | null | undefined, ServiceDurationSource]> = [
    [jobMinutes, "job"], [serviceMinutes, "service"], [priceBookMinutes, "price_book"],
    [businessDefaultMinutes, "business_default"], [DOCUMENTED_FALLBACK_SERVICE_DURATION_MINUTES, "documented_fallback"],
  ];
  for (const [value, source] of candidates) {
    if (Number.isSafeInteger(value) && Number(value) > 0) return { minutes: Number(value), source };
  }
  return { minutes: DOCUMENTED_FALLBACK_SERVICE_DURATION_MINUTES, source: "documented_fallback" };
}

export function densityCounts(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value?.trim() || "Not set";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function technicianMeetsRoutingRequirements({
  requirements, skills, serviceAreas, capabilities,
}: {
  requirements: unknown; skills: string[]; serviceAreas: string[]; capabilities: Record<string, unknown>;
}) {
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) return true;
  const value = requirements as Record<string, unknown>;
  const requiredSkills = Array.isArray(value.skills) ? value.skills.filter((item): item is string => typeof item === "string") : [];
  const requiredAreas = Array.isArray(value.serviceAreas) ? value.serviceAreas.filter((item): item is string => typeof item === "string") : [];
  const requiredCapabilities = Array.isArray(value.capabilities) ? value.capabilities.filter((item): item is string => typeof item === "string") : [];
  return requiredSkills.every((item) => skills.includes(item))
    && requiredAreas.every((item) => serviceAreas.includes(item))
    && requiredCapabilities.every((item) => capabilities[item] === true);
}
