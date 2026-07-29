export type RouteWarningSeverity = "info" | "warning" | "critical";

export type RouteWarningCode =
  | "appointment_window_risk"
  | "insufficient_travel_time"
  | "overlapping_jobs"
  | "missing_coordinates"
  | "route_partial"
  | "route_failed"
  | "route_stale"
  | "technician_start_missing"
  | "excessive_drive_time"
  | "excessive_mileage"
  | "unassigned_job"
  | "stop_order_window_conflict";

export type RouteWarning = {
  id: string;
  code: RouteWarningCode;
  severity: RouteWarningSeverity;
  title: string;
  message: string;
  technicianId: string | null;
  jobId: string | null;
};

export type RouteWarningStop = {
  jobId: string;
  jobNumber: number;
  title: string;
  technicianId: string | null;
  sequence: number | null;
  startsAt: string | null;
  endsAt: string | null;
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  plannedArrivalAt: string | null;
  hasCoordinates: boolean;
  hasScheduleConflict: boolean;
  inboundDrivingDurationSeconds: number | null;
};

export type RouteWarningRoute = {
  technicianId: string;
  technicianName: string;
  calculationStatus: string;
  originType: string | null;
  drivingDistanceMeters: number | null;
  drivingDurationSeconds: number | null;
  errorCode?: string|null;
  failedLegErrorCodes?: string[];
};

export const ROUTE_RISK_THRESHOLDS = {
  excessiveDrivingSeconds: 8 * 60 * 60,
  excessiveDistanceMeters: 200 * 1609.344,
} as const;

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
const miles = (meters: number) => Math.round(meters / 1609.344);
const time = (value: string | null) => value ? new Date(value).getTime() : null;
const routeFailureReason=(route:RouteWarningRoute)=>{
 const codes=[route.errorCode,...(route.failedLegErrorCodes??[])].filter(Boolean) as string[];
 if(codes.some(code=>code==="duplicate_route_stop"||code==="23505"))return "Servonas found conflicting saved stop data from an earlier route. Recalculate to replace the stale stop records; if it repeats, use the reference code shown in server logs.";
 if(codes.includes("unroutable_stop"))return "At least one job has an address without verified coordinates. Verify every service address and recalculate.";
 if(codes.includes("technician_requirement_mismatch"))return "One or more jobs require qualifications, skills, or service-area coverage this technician does not currently satisfy.";
 if(codes.includes("route_endpoint_coordinates_missing"))return "The configured route start or end location is missing usable coordinates.";
 if(codes.includes("daily_stop_limit"))return "This route exceeds the configured maximum number of stops for one calculation.";
 if(codes.includes("segment_provider_failed"))return "Google Routes could not calculate at least one road segment. Other visible segments may still be valid, but the full route and schedule cannot be verified.";
 if(codes.length)return `The route failed while processing ${[...new Set(codes)].join(", ")}. Review the affected stops and server routing log.`;
 return `${route.technicianName} has no complete road route. Travel-time risk cannot be verified.`;
};

function warning(
  code: RouteWarningCode,
  severity: RouteWarningSeverity,
  title: string,
  message: string,
  technicianId: string | null,
  jobId: string | null = null,
): RouteWarning {
  return { id: `${code}:${technicianId ?? "unassigned"}:${jobId ?? "route"}`, code, severity, title, message, technicianId, jobId };
}

export function evaluateRouteWarnings({
  routes,
  stops,
}: {
  routes: RouteWarningRoute[];
  stops: RouteWarningStop[];
}): RouteWarning[] {
  const warnings: RouteWarning[] = [];

  for (const stop of stops) {
    const jobLabel = `Job #${stop.jobNumber}`;
    if (!stop.technicianId) {
      warnings.push(warning("unassigned_job", "warning", "Unassigned job", `${jobLabel} needs a technician before it can be routed.`, null, stop.jobId));
    }
    if (!stop.hasCoordinates) {
      warnings.push(warning("missing_coordinates", "critical", "Missing coordinates", `${jobLabel} cannot be included in a road route until its address is verified.`, stop.technicianId, stop.jobId));
    }
    if (stop.hasScheduleConflict) {
      warnings.push(warning("overlapping_jobs", "critical", "Technician schedule overlap", `${jobLabel} overlaps another job assigned to this technician.`, stop.technicianId, stop.jobId));
    }

    const eta = time(stop.plannedArrivalAt);
    const windowEnd = time(stop.arrivalWindowEnd);
    if (eta !== null && windowEnd !== null && eta > windowEnd) {
      warnings.push(warning(
        "appointment_window_risk",
        "critical",
        "Appointment window may be missed",
        `${jobLabel} has a calculated arrival ${minutes((eta - windowEnd) / 1000)} minutes after its appointment window.`,
        stop.technicianId,
        stop.jobId,
      ));
    }
  }

  for (const route of routes) {
    if (route.calculationStatus === "partial") {
      warnings.push(warning("route_partial", "warning", "Route partially calculated", `${routeFailureReason(route)} Timing risk is uncertain.`, route.technicianId));
    } else if (route.calculationStatus === "failed") {
      warnings.push(warning("route_failed", "critical", "Route calculation failed", routeFailureReason(route), route.technicianId));
    } else if (route.calculationStatus === "stale") {
      warnings.push(warning("route_stale", "warning", "Route is stale", `${route.technicianName}’s route should be recalculated before dispatch.`, route.technicianId));
    }
    if (route.originType === "none" || route.originType === "first_stop" || !route.originType) {
      warnings.push(warning("technician_start_missing", "info", "Technician start location not configured", `${route.technicianName}’s route begins at the first job, so travel to the first stop is not included.`, route.technicianId));
    }
    if (route.drivingDurationSeconds !== null && route.drivingDurationSeconds > ROUTE_RISK_THRESHOLDS.excessiveDrivingSeconds) {
      warnings.push(warning("excessive_drive_time", "warning", "Excessive drive time", `${route.technicianName} has ${minutes(route.drivingDurationSeconds)} minutes of calculated road travel.`, route.technicianId));
    }
    if (route.drivingDistanceMeters !== null && route.drivingDistanceMeters > ROUTE_RISK_THRESHOLDS.excessiveDistanceMeters) {
      warnings.push(warning("excessive_mileage", "warning", "Excessive mileage", `${route.technicianName} has ${miles(route.drivingDistanceMeters)} calculated driving miles.`, route.technicianId));
    }

    const ordered = stops
      .filter((stop) => stop.technicianId === route.technicianId)
      .sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousEnd = time(previous.endsAt);
      const currentStart = time(current.startsAt);
      const roadSeconds = current.inboundDrivingDurationSeconds;
      if (previousEnd !== null && currentStart !== null && roadSeconds !== null) {
        const availableSeconds = Math.floor((currentStart - previousEnd) / 1000);
        if (availableSeconds >= 0 && roadSeconds > availableSeconds) {
          warnings.push(warning(
            "insufficient_travel_time",
            "critical",
            "Insufficient travel time",
            `${route.technicianName} has ${minutes(availableSeconds)} minutes between jobs, but verified road travel requires ${minutes(roadSeconds)} minutes.`,
            route.technicianId,
            current.jobId,
          ));
        }
      }
      const previousWindowStart = time(previous.arrivalWindowStart);
      const currentWindowStart = time(current.arrivalWindowStart);
      if (previousWindowStart !== null && currentWindowStart !== null && currentWindowStart < previousWindowStart) {
        warnings.push(warning(
          "stop_order_window_conflict",
          "warning",
          "Stop order conflicts with appointment windows",
          `Job #${current.jobNumber} has an earlier appointment window than the stop before it.`,
          route.technicianId,
          current.jobId,
        ));
      }
    }
  }

  const rank: Record<RouteWarningSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return warnings.sort((left, right) => rank[left.severity] - rank[right.severity] || left.title.localeCompare(right.title));
}
