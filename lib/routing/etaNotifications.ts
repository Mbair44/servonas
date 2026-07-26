export type RouteEtaEvidence = {
  technicianEnRoute: boolean;
  priorStopCompleted: boolean;
  routeCalculationCurrent: boolean;
  providerDrivingDurationSeconds: number | null;
  confidence: "low" | "medium" | "high";
};

export function canSendProximityEta(evidence: RouteEtaEvidence) {
  return evidence.technicianEnRoute
    && evidence.priorStopCompleted
    && evidence.routeCalculationCurrent
    && Number.isFinite(evidence.providerDrivingDurationSeconds)
    && Number(evidence.providerDrivingDurationSeconds) > 0
    && evidence.confidence === "high";
}

export function etaRangeMinutes(drivingDurationSeconds: number) {
  const minutes = Math.max(1, Math.ceil(drivingDurationSeconds / 60));
  const lower = Math.max(5, Math.floor(minutes / 5) * 5);
  return { lower, upper: Math.max(lower + 5, Math.ceil(minutes / 5) * 5 + 5) };
}
