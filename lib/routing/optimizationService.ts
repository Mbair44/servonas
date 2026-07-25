import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleRoutesProvider } from "./googleRoutesProvider";
import { adjacentOptimizationCandidates, candidateMeetsAppointmentWindows, positiveRoadSavings, type OptimizationStop } from "./optimization";
import type { RouteWaypoint } from "./domain";

type StopRow = {
  id: string; technician_route_id: string; job_id: string; sequence: number; is_locked: boolean;
  latitude: number | string | null; longitude: number | string | null;
  service_duration_seconds: number; appointment_window_start: string | null; appointment_window_end: string | null;
  jobs: { status: string; starts_at: string; ends_at: string | null } | Array<{ status: string; starts_at: string; ends_at: string | null }> | null;
};

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const signature = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function generateRouteOptimizationSuggestions({
  admin, businessId, routePlanId, actorUserId, expectedPlanVersion,
}: {
  admin: SupabaseClient; businessId: string; routePlanId: string; actorUserId: string; expectedPlanVersion: number;
}) {
  const provider = new GoogleRoutesProvider(process.env.GOOGLE_ROUTES_API_KEY ?? "");
  const [{ data: plan }, { data: routes }, { data: stopRows }] = await Promise.all([
    admin.from("route_plans").select("id,version,travel_mode,total_driving_distance_meters,total_driving_duration_seconds").eq("id", routePlanId).eq("business_id", businessId).single(),
    admin.from("technician_routes").select("id,technician_id,driving_distance_meters,driving_duration_seconds,calculation_status").eq("route_plan_id", routePlanId).eq("business_id", businessId),
    admin.from("route_stops").select("id,technician_route_id,job_id,sequence,is_locked,latitude,longitude,service_duration_seconds,appointment_window_start,appointment_window_end,jobs!route_stops_job_tenant_fk(status,starts_at,ends_at)").eq("route_plan_id", routePlanId).eq("business_id", businessId).order("sequence"),
  ]);
  if (!plan || plan.version !== expectedPlanVersion) throw new Error("This route changed while you were editing it. Refresh the route plan before applying your changes.");
  const stops = (stopRows ?? []) as unknown as StopRow[];
  const inputSnapshot = {
    planVersion: plan.version,
    routes: (routes ?? []).map((route) => ({
      technicianId: route.technician_id,
      orderedJobIds: stops.filter((stop) => stop.technician_route_id === route.id).map((stop) => stop.job_id),
    })),
  };
  const { data: run, error: runError } = await admin.from("route_optimization_runs").insert({
    business_id: businessId, route_plan_id: routePlanId, status: "running", provider: provider.name,
    requested_by: actorUserId, requested_at: new Date().toISOString(), started_at: new Date().toISOString(),
    plan_version: plan.version, calculation_signature: signature(inputSnapshot), input_snapshot: inputSnapshot,
    before_driving_distance_meters: plan.total_driving_distance_meters,
    before_driving_duration_seconds: plan.total_driving_duration_seconds,
  }).select("id").single();
  if (runError || !run) throw new Error(`Optimization run could not be stored (${runError?.code ?? "unknown"}).`);

  const suggestions: Array<Record<string, unknown>> = [];
  const outputs: Array<Record<string, unknown>> = [];
  let afterDistance = Number(plan.total_driving_distance_meters ?? 0);
  let afterDuration = Number(plan.total_driving_duration_seconds ?? 0);
  try {
    for (const route of routes ?? []) {
      if (route.calculation_status !== "ready" || route.driving_distance_meters === null || route.driving_duration_seconds === null) continue;
      const routeRows = stops.filter((stop) => stop.technician_route_id === route.id);
      if (routeRows.length < 3 || routeRows.length > 27 || routeRows.some((stop) => stop.latitude === null || stop.longitude === null)) continue;
      const normalized: OptimizationStop[] = routeRows.map((stop) => {
        const job = relation(stop.jobs)!;
        return {
          jobId: stop.job_id, status: job.status, isLocked: stop.is_locked, startsAt: job.starts_at,
          appointmentWindowStart: stop.appointment_window_start, appointmentWindowEnd: stop.appointment_window_end,
          serviceDurationSeconds: stop.service_duration_seconds,
        };
      });
      const lockMinutes = Number(process.env.ROUTE_OPTIMIZATION_LOCK_MINUTES ?? 60);
      const candidates = adjacentOptimizationCandidates(normalized, new Date(), Number.isFinite(lockMinutes) ? lockMinutes : 60);
      let best: { order: OptimizationStop[]; distance: number; duration: number; requestId: string | null } | null = null;
      for (const candidate of candidates) {
        const waypointByJob = new Map(routeRows.map((stop) => [stop.job_id, {
          id: stop.job_id, latitude: Number(stop.latitude), longitude: Number(stop.longitude),
        } satisfies RouteWaypoint]));
        const waypoints = candidate.map((stop) => waypointByJob.get(stop.jobId)!);
        const result = await provider.computeRoute({
          origin: waypoints[0], intermediates: waypoints.slice(1, -1), destination: waypoints.at(-1)!,
          travelMode: plan.travel_mode,
          departureAt: new Date(normalized[0].startsAt).getTime() > Date.now() ? normalized[0].startsAt : undefined,
        });
        const workingDayEndAt = routeRows.map((stop) => relation(stop.jobs)?.ends_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
        if (!candidateMeetsAppointmentWindows({ stops: candidate, legs: result.legs, routeStartAt: normalized[0].startsAt, workingDayEndAt })) continue;
        const savings = positiveRoadSavings(
          { distance: route.driving_distance_meters, duration: route.driving_duration_seconds },
          { distance: result.drivingDistanceMeters, duration: result.drivingDurationSeconds },
        );
        if (!savings) continue;
        if (!best || result.drivingDurationSeconds < best.duration
          || (result.drivingDurationSeconds === best.duration && result.drivingDistanceMeters < best.distance)) {
          best = { order: candidate, distance: result.drivingDistanceMeters, duration: result.drivingDurationSeconds, requestId: result.providerRequestId };
        }
      }
      if (!best) continue;
      const distanceSaved = Math.max(0, route.driving_distance_meters - best.distance);
      const timeSaved = Math.max(0, route.driving_duration_seconds - best.duration);
      const summary = `Reorder this technician’s stops to save ${timeSaved >= 60 ? `${Math.round(timeSaved / 60)} driving minutes` : `${(distanceSaved / 1609.344).toFixed(1)} driving miles`}.`;
      suggestions.push({
        business_id: businessId, route_plan_id: routePlanId, optimization_run_id: run.id,
        suggestion_type: "reorder", status: "pending", summary,
        estimated_distance_saved_meters: distanceSaved, estimated_time_saved_seconds: timeSaved,
        payload: { technicianId: route.technician_id, technicianRouteId: route.id, orderedJobIds: best.order.map((stop) => stop.jobId), planVersion: plan.version },
      });
      outputs.push({ technicianId: route.technician_id, orderedJobIds: best.order.map((stop) => stop.jobId), distanceMeters: best.distance, durationSeconds: best.duration, providerRequestId: best.requestId });
      afterDistance += best.distance - route.driving_distance_meters;
      afterDuration += best.duration - route.driving_duration_seconds;
    }
    if (suggestions.length) {
      const { error } = await admin.from("route_suggestions").insert(suggestions);
      if (error) throw new Error(`Optimization suggestions could not be stored (${error.code}).`);
    }
    await admin.from("route_optimization_runs").update({
      status: "completed", completed_at: new Date().toISOString(),
      output_snapshot: { suggestions: outputs },
      after_driving_distance_meters: afterDistance, after_driving_duration_seconds: afterDuration,
    }).eq("id", run.id).eq("business_id", businessId);
    return { suggestions: suggestions.length };
  } catch (error) {
    await admin.from("route_optimization_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_code: "optimization_failed" }).eq("id", run.id).eq("business_id", businessId);
    throw error;
  }
}
