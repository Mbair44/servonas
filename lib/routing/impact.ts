export type RoadMetrics = {
  drivingDistanceMeters: number | null;
  drivingDurationSeconds: number | null;
};

export type TechnicianRouteImpact = {
  technicianName: string;
  before: RoadMetrics | null;
  after: RoadMetrics | null;
};

const hasMetrics = (value: RoadMetrics | null): value is { drivingDistanceMeters: number; drivingDurationSeconds: number } =>
  value?.drivingDistanceMeters !== null && value?.drivingDistanceMeters !== undefined
  && value.drivingDurationSeconds !== null && value.drivingDurationSeconds !== undefined;

function signedChange(value: number, unit: "distance" | "duration") {
  const magnitude = Math.abs(value);
  if (unit === "distance") {
    if (magnitude < 50) return "no material mileage change";
    return `${(magnitude / 1609.344).toFixed(1)} ${value < 0 ? "fewer" : "additional"} driving miles`;
  }
  if (magnitude < 30) return "no material drive-time change";
  return `${Math.max(1, Math.round(magnitude / 60))} ${value < 0 ? "fewer" : "additional"} driving minutes`;
}

export function actualRouteImpactSummary(impacts: TechnicianRouteImpact[]) {
  if (!impacts.length || impacts.some((impact) => !hasMetrics(impact.before) || !hasMetrics(impact.after))) return null;
  const lines = impacts.map((impact) => {
    const before = impact.before as { drivingDistanceMeters: number; drivingDurationSeconds: number };
    const after = impact.after as { drivingDistanceMeters: number; drivingDurationSeconds: number };
    return `${impact.technicianName}: ${signedChange(after.drivingDistanceMeters - before.drivingDistanceMeters, "distance")}, ${signedChange(after.drivingDurationSeconds - before.drivingDurationSeconds, "duration")}`;
  });
  const netDistance = impacts.reduce((total, impact) => total + (
    (impact.after!.drivingDistanceMeters as number) - (impact.before!.drivingDistanceMeters as number)
  ), 0);
  const netDuration = impacts.reduce((total, impact) => total + (
    (impact.after!.drivingDurationSeconds as number) - (impact.before!.drivingDurationSeconds as number)
  ), 0);
  return `${lines.join("; ")}. Net: ${signedChange(netDistance, "distance")}, ${signedChange(netDuration, "duration")}.`;
}
