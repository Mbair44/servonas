export function canReuseCalculatedRoute({
  status, drivingDistanceMeters, drivingDurationSeconds, geometryRequired,
  aggregatePolyline, hasSafeLegGeometry,
}: {
  status: string;
  drivingDistanceMeters: number | null;
  drivingDurationSeconds: number | null;
  geometryRequired: boolean;
  aggregatePolyline: string | null;
  hasSafeLegGeometry: boolean;
}) {
  if (status !== "ready") return false;
  if (drivingDistanceMeters === null || drivingDurationSeconds === null) return false;
  return !geometryRequired || Boolean(aggregatePolyline) || hasSafeLegGeometry;
}
