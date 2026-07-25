import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { GoogleRoutesProvider } from "./googleRoutesProvider";
import type { ComputeRouteInput, DrivingRouteResult, RoutingProvider, RouteWaypoint } from "./domain";
import {
  mergeEncodedPolylines,
  SERVONAS_MAX_DAILY_ROUTE_STOPS,
  splitRouteWaypoints,
  type RouteSegment,
} from "./segmentation";

type RouteJob = {
  id: string;
  assigned_technician_id: string;
  starts_at: string;
  ends_at: string | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  estimated_duration_minutes: number | null;
  service_location_id: string;
  service_locations: {
    latitude: number | string;
    longitude: number | string;
    geocoding_status: string;
    street_address: string;
    unit: string | null;
    city: string;
    state: string;
    postal_code: string;
  } | Array<{
    latitude: number | string;
    longitude: number | string;
    geocoding_status: string;
    street_address: string;
    unit: string | null;
    city: string;
    state: string;
    postal_code: string;
  }> | null;
};

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const signature = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const databaseFailure = (stage: string, error: { code?: string; message?: string; details?: string; hint?: string } | null) =>
  `${stage} (${error?.code ?? "missing"}): ${[error?.message, error?.details, error?.hint].filter(Boolean).join(" ")}`;

function providerFromEnvironment(): RoutingProvider {
  const provider = process.env.ROUTING_PROVIDER?.trim().toLowerCase() || "google";
  if (provider !== "google") throw new Error(`Unsupported routing provider: ${provider}`);
  return new GoogleRoutesProvider(process.env.GOOGLE_ROUTES_API_KEY ?? "");
}

export type RouteCalculationSummary = {
  calculated: number;
  cached: number;
  failed: number;
  partial: number;
  skipped: number;
};

export async function calculateDailyRoutes({
  admin,
  businessId,
  serviceDate,
  businessTimeZone,
  actorUserId,
}: {
  admin: SupabaseClient;
  businessId: string;
  serviceDate: string;
  businessTimeZone: string;
  actorUserId: string;
}): Promise<RouteCalculationSummary> {
  const provider = providerFromEnvironment();
  const start = zonedDateTimeToUtc(serviceDate, "00:00", businessTimeZone);
  const end = zonedDateTimeToUtc(addDays(serviceDate, 1), "00:00", businessTimeZone);
  const { data: rows, error: jobsError } = await admin.from("jobs")
    .select("id,assigned_technician_id,starts_at,ends_at,arrival_window_start,arrival_window_end,estimated_duration_minutes,service_location_id,service_locations!jobs_service_location_tenant_fk(latitude,longitude,geocoding_status,street_address,unit,city,state,postal_code)")
    .eq("business_id", businessId).eq("is_deleted", false)
    .not("assigned_technician_id", "is", null)
    .not("status", "in", '("canceled","declined")')
    .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString())
    .order("starts_at");
  if (jobsError) throw new Error(databaseFailure("Scheduled route jobs could not be loaded", jobsError));
  const jobs = (rows ?? []) as unknown as RouteJob[];
  const { data: plan, error: planError } = await admin.from("route_plans").upsert({
    business_id: businessId,
    service_date: serviceDate,
    business_timezone: businessTimeZone,
    calculation_status: "calculating",
    provider: provider.name,
    updated_by: actorUserId,
  }, { onConflict: "business_id,service_date" }).select("id,travel_mode").single();
  if (planError || !plan) throw new Error(databaseFailure("Route plan could not be prepared", planError));
  await admin.from("route_plans").update({
    calculation_status: "calculating",
    error_code: null,
  }).eq("id", plan.id).eq("business_id", businessId);

  const groups = new Map<string, RouteJob[]>();
  for (const job of jobs) groups.set(job.assigned_technician_id, [...(groups.get(job.assigned_technician_id) ?? []), job]);
  const { data: previousRoutes } = await admin.from("technician_routes").select("id,technician_id")
    .eq("business_id", businessId).eq("route_plan_id", plan.id);
  const removedRouteIds = (previousRoutes ?? [])
    .filter((route) => !groups.has(route.technician_id))
    .map((route) => route.id);
  if (removedRouteIds.length) {
    await admin.from("technician_routes").delete().eq("business_id", businessId).in("id", removedRouteIds);
  }
  const summary: RouteCalculationSummary = { calculated: 0, cached: 0, failed: 0, partial: 0, skipped: 0 };
  let planDistance = 0;
  let planDuration = 0;

  for (const [technicianId, technicianJobs] of groups) {
    const routable = technicianJobs.flatMap((job) => {
      const location = relation(job.service_locations);
      if (!location || !["verified", "manual"].includes(location.geocoding_status)) return [];
      const latitude = Number(location.latitude), longitude = Number(location.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{ job, location, waypoint: { id: job.id, latitude, longitude } satisfies RouteWaypoint }];
    });
    if (routable.length !== technicianJobs.length || routable.length === 0) {
      await admin.from("technician_routes").update({
        calculation_status: "failed",
        encoded_polyline: null,
        driving_distance_meters: null,
        driving_duration_seconds: null,
        error_code: "unroutable_stop",
      }).eq("business_id", businessId).eq("route_plan_id", plan.id).eq("technician_id", technicianId);
      summary.skipped += 1;
      continue;
    }
    const routeSignature = signature({
      provider: provider.name,
      travelMode: plan.travel_mode,
      stops: routable.map(({ job, waypoint }) => ({
        id: job.id, latitude: waypoint.latitude, longitude: waypoint.longitude,
        startsAt: job.starts_at, endsAt: job.ends_at, duration: job.estimated_duration_minutes,
      })),
    });
    const { data: existing } = await admin.from("technician_routes")
      .select("id,calculation_signature,calculation_status,driving_distance_meters,driving_duration_seconds")
      .eq("business_id", businessId).eq("route_plan_id", plan.id).eq("technician_id", technicianId).maybeSingle();
    if (existing?.calculation_signature === routeSignature && existing.calculation_status === "ready") {
      summary.cached += 1;
      planDistance += existing.driving_distance_meters ?? 0;
      planDuration += existing.driving_duration_seconds ?? 0;
      continue;
    }
    const first = routable[0], last = routable.at(-1)!;
    const { data: technicianRoute, error: routeError } = await admin.from("technician_routes").upsert({
      business_id: businessId, route_plan_id: plan.id, technician_id: technicianId,
      origin_type: "first_stop", origin_label: first.location.street_address,
      origin_latitude: first.waypoint.latitude, origin_longitude: first.waypoint.longitude,
      destination_type: "last_stop", destination_label: last.location.street_address,
      destination_latitude: last.waypoint.latitude, destination_longitude: last.waypoint.longitude,
      stop_count: routable.length,
      service_duration_seconds: routable.reduce((total, item) => total + (item.job.estimated_duration_minutes ?? 0) * 60, 0),
      provider: provider.name, calculation_status: "calculating", calculation_signature: routeSignature,
      encoded_polyline: null, driving_distance_meters: null, driving_duration_seconds: null,
      error_code: null, updated_by: actorUserId,
    }, { onConflict: "business_id,route_plan_id,technician_id" }).select("id").single();
    if (routeError || !technicianRoute) {
      summary.failed += 1;
      continue;
    }
    await admin.from("route_stops").delete().eq("business_id", businessId).eq("technician_route_id", technicianRoute.id);
    const { data: stops, error: stopsError } = await admin.from("route_stops").insert(routable.map(({ job, location }, index) => ({
      business_id: businessId, route_plan_id: plan.id, technician_route_id: technicianRoute.id,
      job_id: job.id, service_location_id: job.service_location_id, sequence: index + 1,
      planned_arrival_at: job.starts_at, planned_departure_at: job.ends_at,
      appointment_window_start: job.arrival_window_start, appointment_window_end: job.arrival_window_end,
      service_duration_seconds: (job.estimated_duration_minutes ?? 0) * 60,
      latitude: Number(location.latitude), longitude: Number(location.longitude),
      address_snapshot: [location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", "),
      calculation_status: "calculating", created_by: actorUserId, updated_by: actorUserId,
    }))).select("id,job_id,sequence");
    if (stopsError || !stops) {
      await admin.from("technician_routes").update({ calculation_status: "failed", error_code: stopsError?.code ?? "stop_write_failed" }).eq("id", technicianRoute.id);
      summary.failed += 1;
      continue;
    }
    if (routable.length === 1) {
      const now = new Date().toISOString();
      await admin.from("route_stops").update({ calculation_status: "ready" }).eq("id", stops[0].id);
      await admin.from("technician_routes").update({ calculation_status: "ready", driving_distance_meters: 0, driving_duration_seconds: 0, calculated_at: now }).eq("id", technicianRoute.id);
      summary.calculated += 1;
      continue;
    }
    if (routable.length > SERVONAS_MAX_DAILY_ROUTE_STOPS) {
      await admin.from("technician_routes").update({ calculation_status: "failed", error_code: "daily_stop_limit" }).eq("id", technicianRoute.id);
      await admin.from("route_stops").update({ calculation_status: "failed", error_code: "daily_stop_limit" }).eq("technician_route_id", technicianRoute.id);
      summary.failed += 1;
      continue;
    }
    const stopByJob = new Map(stops.map((stop) => [stop.job_id, stop]));
    const segments = splitRouteWaypoints(routable.map((item) => item.waypoint));
    const outcomes: Array<{ segment: RouteSegment; result?: DrivingRouteResult; error?: string }> = [];
    for (const segment of segments) {
      const input: ComputeRouteInput = {
        origin: segment.waypoints[0],
        intermediates: segment.waypoints.slice(1, -1),
        destination: segment.waypoints.at(-1)!,
        travelMode: plan.travel_mode,
        departureAt: segment.index === 0 && new Date(first.job.starts_at).getTime() > Date.now()
          ? first.job.starts_at : undefined,
      };
      try {
        outcomes.push({ segment, result: await provider.computeRoute(input) });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error("Technician route segment calculation failed", {
          businessId, technicianId, segmentIndex: segment.index,
          segmentCount: segments.length, provider: provider.name, reason,
        });
        outcomes.push({ segment, error: reason });
      }
    }
    const readyOutcomes = outcomes.filter((outcome): outcome is typeof outcome & { result: DrivingRouteResult } => Boolean(outcome.result));
    const failedOutcomes = outcomes.filter((outcome) => !outcome.result);
    type PersistedLeg = {
      business_id: string; technician_route_id: string;
      from_route_stop_id: string; to_route_stop_id: string;
      sequence: number; driving_distance_meters: number | null; driving_duration_seconds: number | null;
      encoded_polyline: string | null; provider: string; provider_request_id: string | null;
      calculation_status: "ready" | "failed"; calculated_at: string | null;
      provider_warnings: Array<{ code: string; message: string }>; error_code: string | null;
    };
    const legRows: PersistedLeg[] = [];
    for (const outcome of outcomes) {
      const segmentResult = outcome.result;
      if (segmentResult) {
        legRows.push(...segmentResult.legs.map((leg, localIndex) => ({
          business_id: businessId, technician_route_id: technicianRoute.id,
          from_route_stop_id: stopByJob.get(leg.fromWaypointId)!.id,
          to_route_stop_id: stopByJob.get(leg.toWaypointId)!.id,
          sequence: outcome.segment.startWaypointIndex + localIndex + 1,
          driving_distance_meters: leg.drivingDistanceMeters,
          driving_duration_seconds: leg.drivingDurationSeconds,
          encoded_polyline: leg.encodedPolyline,
          provider: segmentResult.provider,
          provider_request_id: segmentResult.providerRequestId,
          calculation_status: "ready" as const, calculated_at: segmentResult.calculatedAt,
          provider_warnings: leg.providerWarnings, error_code: null,
        })));
        continue;
      }
      legRows.push(...outcome.segment.waypoints.slice(0, -1).map((waypoint, localIndex) => ({
        business_id: businessId, technician_route_id: technicianRoute.id,
        from_route_stop_id: stopByJob.get(waypoint.id)!.id,
        to_route_stop_id: stopByJob.get(outcome.segment.waypoints[localIndex + 1].id)!.id,
        sequence: outcome.segment.startWaypointIndex + localIndex + 1,
        driving_distance_meters: null, driving_duration_seconds: null,
        encoded_polyline: null, provider: provider.name, provider_request_id: null,
        calculation_status: "failed" as const, calculated_at: null,
        provider_warnings: [], error_code: "segment_provider_failed",
      })));
    }
    const { error: legError } = await admin.from("route_legs").insert(legRows);
    if (legError) {
      console.error("Segmented route legs could not be stored", { code: legError.code, businessId, technicianId });
      await admin.from("technician_routes").update({ calculation_status: "failed", error_code: "leg_write_failed" }).eq("id", technicianRoute.id);
      summary.failed += 1;
      continue;
    }
    const readyLegBySequence = new Map(legRows.filter((leg) => leg.calculation_status === "ready").map((leg) => [leg.sequence, leg]));
    let arrivalMs = new Date(first.job.starts_at).getTime();
    let arrivalKnown = true;
    for (let index = 0; index < routable.length; index += 1) {
      const item = routable[index];
      const appointmentStart = item.job.arrival_window_start ? new Date(item.job.arrival_window_start).getTime() : null;
      if (arrivalKnown && appointmentStart !== null) arrivalMs = Math.max(arrivalMs, appointmentStart);
      const serviceSeconds = (item.job.estimated_duration_minutes ?? 0) * 60;
      const departureMs = arrivalMs + serviceSeconds * 1000;
      await admin.from("route_stops").update(arrivalKnown ? {
        calculation_status: "ready", error_code: null,
        planned_arrival_at: new Date(arrivalMs).toISOString(),
        planned_departure_at: new Date(departureMs).toISOString(),
      } : {
        calculation_status: "failed", error_code: "prior_segment_failed",
        planned_arrival_at: item.job.starts_at, planned_departure_at: item.job.ends_at,
      }).eq("id", stopByJob.get(item.job.id)!.id);
      const nextLeg = readyLegBySequence.get(index + 1);
      if (index < routable.length - 1 && !nextLeg) arrivalKnown = false;
      if (arrivalKnown && nextLeg) arrivalMs = departureMs + Number(nextLeg.driving_duration_seconds) * 1000;
    }
    const routeDistance = readyOutcomes.reduce((total, outcome) => total + outcome.result.drivingDistanceMeters, 0);
    const routeDuration = readyOutcomes.reduce((total, outcome) => total + outcome.result.drivingDurationSeconds, 0);
    const routeStatus = failedOutcomes.length ? (readyOutcomes.length ? "partial" : "failed") : "ready";
    const mergedPolyline = routeStatus === "ready"
      ? mergeEncodedPolylines(readyOutcomes.map((outcome) => outcome.result.encodedPolyline ?? "").filter(Boolean))
      : null;
    await admin.from("technician_routes").update({
      calculation_status: routeStatus, encoded_polyline: mergedPolyline,
      driving_distance_meters: readyOutcomes.length ? routeDistance : null,
      driving_duration_seconds: readyOutcomes.length ? routeDuration : null,
      provider: provider.name,
      provider_route_id: readyOutcomes.map((outcome) => outcome.result.providerRequestId).filter(Boolean).join(",") || null,
      calculated_at: new Date().toISOString(), stale_at: null,
      error_code: failedOutcomes.length ? "segment_provider_failed" : null,
    }).eq("id", technicianRoute.id);
    planDistance += routeDistance;
    planDuration += routeDuration;
    if (routeStatus === "ready") summary.calculated += 1;
    else if (routeStatus === "partial") summary.partial += 1;
    else summary.failed += 1;
  }
  const finalStatus = summary.failed || summary.skipped || summary.partial
    ? (summary.calculated || summary.cached || summary.partial ? "partial" : "failed") : "ready";
  await admin.from("route_plans").update({
    calculation_status: finalStatus,
    total_driving_distance_meters: planDistance,
    total_driving_duration_seconds: planDuration,
    calculated_at: new Date().toISOString(),
    calculation_signature: signature({ provider: provider.name, groups: [...groups.keys()] }),
    error_code: finalStatus === "failed" ? "no_routes_calculated" : null,
    stale_at: null,
  }).eq("id", plan.id).eq("business_id", businessId);
  const { data: verifiedRoutes, error: verificationError } = await admin.from("technician_routes")
    .select("id,calculation_status,encoded_polyline,stop_count")
    .eq("business_id", businessId).eq("route_plan_id", plan.id);
  if (verificationError) {
    throw new Error(databaseFailure("Calculated routes could not be verified", verificationError));
  }
  if (groups.size > 0 && (verifiedRoutes?.length ?? 0) === 0) {
    throw new Error("Route calculation persisted no technician route records.");
  }
  return summary;
}
