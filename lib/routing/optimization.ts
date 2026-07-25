import type { DrivingRouteLeg } from "./domain";

export const DEFAULT_OPTIMIZATION_LOCK_MINUTES = 60;

export type OptimizationStop = {
  jobId: string;
  status: string;
  isLocked: boolean;
  startsAt: string;
  appointmentWindowStart: string | null;
  appointmentWindowEnd: string | null;
  serviceDurationSeconds: number;
};

const protectedStatuses = new Set(["en_route", "arrived", "in_progress", "completed"]);

export function isOptimizationProtected(stop: OptimizationStop, now: Date, lockMinutes = DEFAULT_OPTIMIZATION_LOCK_MINUTES) {
  return stop.isLocked || protectedStatuses.has(stop.status)
    || new Date(stop.startsAt).getTime() <= now.getTime() + lockMinutes * 60_000;
}

export function adjacentOptimizationCandidates(stops: OptimizationStop[], now: Date, lockMinutes = DEFAULT_OPTIMIZATION_LOCK_MINUTES) {
  const candidates: OptimizationStop[][] = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    if (isOptimizationProtected(stops[index], now, lockMinutes) || isOptimizationProtected(stops[index + 1], now, lockMinutes)) continue;
    const candidate = [...stops];
    [candidate[index], candidate[index + 1]] = [candidate[index + 1], candidate[index]];
    candidates.push(candidate);
  }
  return candidates;
}

export function candidateMeetsAppointmentWindows({
  stops,
  legs,
  routeStartAt,
  workingDayEndAt,
}: {
  stops: OptimizationStop[];
  legs: DrivingRouteLeg[];
  routeStartAt: string;
  workingDayEndAt?: string | null;
}) {
  if (legs.length !== Math.max(0, stops.length - 1)) return false;
  let arrival = new Date(routeStartAt).getTime();
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    const windowStart = stop.appointmentWindowStart ? new Date(stop.appointmentWindowStart).getTime() : null;
    const windowEnd = stop.appointmentWindowEnd ? new Date(stop.appointmentWindowEnd).getTime() : null;
    if (windowStart !== null) arrival = Math.max(arrival, windowStart);
    if (windowEnd !== null && arrival > windowEnd) return false;
    arrival += stop.serviceDurationSeconds * 1000;
    if (index < legs.length) arrival += legs[index].drivingDurationSeconds * 1000;
  }
  return !workingDayEndAt || arrival <= new Date(workingDayEndAt).getTime();
}

export function positiveRoadSavings(before: { distance: number; duration: number }, after: { distance: number; duration: number }) {
  const distance = before.distance - after.distance;
  const duration = before.duration - after.duration;
  return distance > 0 || duration > 0
    ? { distanceMeters: Math.max(0, distance), durationSeconds: Math.max(0, duration) }
    : null;
}
