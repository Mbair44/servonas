export type RouteMetricInput = {
  totalJobs: number;
  assignedJobs: number;
  jobsAtRisk: number;
  stopsMissingCoordinates: number;
  routes: Array<{
    calculationStatus: string;
    drivingDistanceMeters: number | null;
    drivingDurationSeconds: number | null;
    stopCount: number;
    serviceDurationSeconds: number;
    warningCount: number;
  }>;
  potentialDistanceSavingsMeters?: number;
  potentialTimeSavingsSeconds?: number;
};

export function routeMetrics(input: RouteMetricInput) {
  const authoritative = input.routes.filter((route) =>
    ["ready", "partial"].includes(route.calculationStatus)
  );
  const drivingDistanceMeters = authoritative.reduce((sum, route) => sum + (route.drivingDistanceMeters ?? 0), 0);
  const drivingDurationSeconds = authoritative.reduce((sum, route) => sum + (route.drivingDurationSeconds ?? 0), 0);
  const routedLegCount = authoritative.reduce((sum, route) => sum + Math.max(0, route.stopCount - 1), 0);
  return {
    totalJobs: input.totalJobs,
    assignedJobs: input.assignedJobs,
    unassignedJobs: Math.max(0, input.totalJobs - input.assignedJobs),
    drivingDistanceMeters,
    drivingDurationSeconds,
    averageDriveSeconds: routedLegCount ? Math.round(drivingDurationSeconds / routedLegCount) : null,
    jobsAtRisk: input.jobsAtRisk,
    routesWithWarnings: input.routes.filter((route) => route.warningCount > 0 || ["partial", "failed"].includes(route.calculationStatus)).length,
    stopsMissingCoordinates: input.stopsMissingCoordinates,
    potentialDistanceSavingsMeters: Math.max(0, input.potentialDistanceSavingsMeters ?? 0),
    potentialTimeSavingsSeconds: Math.max(0, input.potentialTimeSavingsSeconds ?? 0),
  };
}

export const formatEstimatedMiles = (meters: number) => `${(meters / 1609.344).toFixed(1)} mi`;
export const formatEstimatedDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
};
