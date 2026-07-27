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
import { resolveRouteEndpoints } from "./endpoints";
import { resolveServiceDuration, technicianMeetsRoutingRequirements } from "./serviceDuration";
import { canReuseCalculatedRoute } from "./cacheValidity";

type RouteJob = {
  id: string;
  job_number: number;
  title: string;
  assigned_technician_id: string;
  starts_at: string;
  ends_at: string | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  estimated_duration_minutes: number | null;
  service_id: string | null;
  routing_requirements: Record<string, unknown>;
  service_location_id: string;
  service_locations: {
    latitude: number | string;
    longitude: number | string;
    geocoding_status: string;
    location_name: string;
    street_address: string;
    unit: string | null;
    city: string;
    state: string;
    postal_code: string;
  } | Array<{
    latitude: number | string;
    longitude: number | string;
    geocoding_status: string;
    location_name: string;
    street_address: string;
    unit: string | null;
    city: string;
    state: string;
    postal_code: string;
  }> | null;
  services: { name: string; duration_minutes: number | null } | Array<{ name: string; duration_minutes: number | null }> | null;
  customers: { first_name: string; last_name: string; company_name: string | null } | Array<{ first_name: string; last_name: string; company_name: string | null }> | null;
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
  onlyTechnicianId,
}: {
  admin: SupabaseClient;
  businessId: string;
  serviceDate: string;
  businessTimeZone: string;
  actorUserId: string;
  onlyTechnicianId?: string;
}): Promise<RouteCalculationSummary> {
  const operationStartedAt = Date.now();
  const provider = providerFromEnvironment();
  const start = zonedDateTimeToUtc(serviceDate, "00:00", businessTimeZone);
  const end = zonedDateTimeToUtc(addDays(serviceDate, 1), "00:00", businessTimeZone);
  let jobsQuery = admin.from("jobs")
    .select("id,job_number,title,assigned_technician_id,starts_at,ends_at,arrival_window_start,arrival_window_end,estimated_duration_minutes,service_id,service_location_id,routing_requirements,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),service_locations!jobs_service_location_tenant_fk(location_name,latitude,longitude,geocoding_status,street_address,unit,city,state,postal_code),services!jobs_service_tenant_fk(name,duration_minutes)")
    .eq("business_id", businessId).eq("is_deleted", false)
    .not("assigned_technician_id", "is", null)
    .not("status", "in", '("canceled","declined")')
    .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
  if (onlyTechnicianId) jobsQuery = jobsQuery.eq("assigned_technician_id", onlyTechnicianId);
  const { data: rows, error: jobsError } = await jobsQuery.order("starts_at");
  if (jobsError) throw new Error(databaseFailure("Scheduled route jobs could not be loaded", jobsError));
  const jobs = (rows ?? []) as unknown as RouteJob[];
  const serviceIds = [...new Set(jobs.map((job) => job.service_id).filter((value): value is string => Boolean(value)))];
  const technicianIds = [...new Set(jobs.map((job) => job.assigned_technician_id))];
  const [{ data: routingPolicy }, { data: priceDurations }, { data: technicianCapabilities }] = await Promise.all([
    admin.from("business_routing_policies").select("default_service_duration_minutes").eq("business_id", businessId).maybeSingle(),
    serviceIds.length
      ? admin.from("price_book_items").select("service_id,estimated_duration_minutes").eq("business_id", businessId).in("service_id", serviceIds).eq("is_active", true).eq("is_deleted", false).not("estimated_duration_minutes", "is", null)
      : Promise.resolve({ data: [] as Array<{ service_id: string; estimated_duration_minutes: number }> }),
    admin.from("technician_directory").select("id,preferred_name,skills,service_areas,routing_capabilities,employee_id").eq("business_id", businessId).in("id", technicianIds),
  ]);
  const employeeIds=[...new Set((technicianCapabilities??[]).map(item=>item.employee_id).filter((value):value is string=>Boolean(value)))];
  const {data:structuredQualifications,error:structuredQualificationError}=employeeIds.length
    ?await admin.from("employee_qualifications")
      .select("employee_id,workforce_qualifications!employee_qualifications_definition_tenant_fk(name,is_active)")
      .eq("business_id",businessId).in("employee_id",employeeIds).eq("status","active")
      .or(`expires_on.is.null,expires_on.gte.${serviceDate}`)
    :{data:[],error:null};
  if(structuredQualificationError){
    console.warn("Structured workforce qualifications unavailable; using technician compatibility skills",{
      businessId,code:structuredQualificationError.code,
    });
  }
  const structuredSkillsByEmployee=new Map<string,string[]>();
  for(const assignment of structuredQualifications??[]){
    const definition=relation(assignment.workforce_qualifications) as {name:string;is_active:boolean}|null;
    if(!definition?.is_active)continue;
    structuredSkillsByEmployee.set(assignment.employee_id,[
      ...(structuredSkillsByEmployee.get(assignment.employee_id)??[]),definition.name,
    ]);
  }
  const priceDurationByService = new Map((priceDurations ?? []).map((item) => [item.service_id, item.estimated_duration_minutes]));
  const capabilityByTechnician = new Map((technicianCapabilities ?? []).map((technician) => [technician.id, technician]));
  const { data: plan, error: planError } = await admin.from("route_plans").upsert({
    business_id: businessId,
    service_date: serviceDate,
    business_timezone: businessTimeZone,
    calculation_status: "calculating",
    provider: provider.name,
    updated_by: actorUserId,
  }, { onConflict: "business_id,service_date" }).select("id,travel_mode").single();
  if (planError || !plan) throw new Error(databaseFailure("Route plan could not be prepared", planError));
  const {error:calculationStartError}=await admin.from("route_plans").update({
    calculation_status: "calculating",
    error_code: null,
  }).eq("id", plan.id).eq("business_id", businessId);
  if(calculationStartError){
    throw new Error(databaseFailure("Route calculation state could not be started",calculationStartError));
  }

  const groups = new Map<string, RouteJob[]>();
  for (const job of jobs) groups.set(job.assigned_technician_id, [...(groups.get(job.assigned_technician_id) ?? []), job]);
  if (onlyTechnicianId) {
    const { data: manualStops } = await admin.from("route_stops")
      .select("job_id,sequence,technician_routes!inner(technician_id)")
      .eq("business_id", businessId).eq("route_plan_id", plan.id)
      .eq("technician_routes.technician_id", onlyTechnicianId)
      .order("sequence");
    const order = new Map((manualStops ?? []).map((stop) => [stop.job_id, stop.sequence]));
    const technicianJobs = groups.get(onlyTechnicianId);
    if (technicianJobs && order.size) {
      technicianJobs.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    }
  }
  const { data: previousRoutes } = await admin.from("technician_routes").select("id,technician_id")
    .eq("business_id", businessId).eq("route_plan_id", plan.id);
  const removedRouteIds = (previousRoutes ?? [])
    .filter((route) => !onlyTechnicianId || route.technician_id === onlyTechnicianId)
    .filter((route) => !groups.has(route.technician_id))
    .map((route) => route.id);
  if (removedRouteIds.length) {
    await admin.from("technician_routes").delete().eq("business_id", businessId).in("id", removedRouteIds);
  }
  const summary: RouteCalculationSummary = { calculated: 0, cached: 0, failed: 0, partial: 0, skipped: 0 };
  let planDistance = 0;
  let planDuration = 0;

  for (const [technicianId, technicianJobs] of groups) {
    const technicianCapability = capabilityByTechnician.get(technicianId);
    if (technicianJobs.some((job) => !technicianMeetsRoutingRequirements({
      requirements: job.routing_requirements,
      skills: technicianCapability?.employee_id&&structuredQualifications
        ? structuredSkillsByEmployee.get(technicianCapability.employee_id)??[]
        : technicianCapability?.skills ?? [],
      serviceAreas: technicianCapability?.service_areas ?? [],
      capabilities: technicianCapability?.routing_capabilities ?? {},
    }))) {
      await admin.from("technician_routes").update({
        calculation_status: "failed", encoded_polyline: null,
        driving_distance_meters: null, driving_duration_seconds: null,
        error_code: "technician_requirement_mismatch",
      }).eq("business_id", businessId).eq("route_plan_id", plan.id).eq("technician_id", technicianId);
      summary.skipped += 1;
      continue;
    }
    const routable = technicianJobs.flatMap((job) => {
      const location = relation(job.service_locations);
      if (!location || !["verified", "manual"].includes(location.geocoding_status)) return [];
      const latitude = Number(location.latitude), longitude = Number(location.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const duration = resolveServiceDuration({
        jobMinutes: job.estimated_duration_minutes,
        serviceMinutes: relation(job.services)?.duration_minutes,
        priceBookMinutes: job.service_id ? priceDurationByService.get(job.service_id) : null,
        businessDefaultMinutes: routingPolicy?.default_service_duration_minutes,
      });
      return [{ job, location, duration, waypoint: { id: job.id, latitude, longitude } satisfies RouteWaypoint }];
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
    const first = routable[0], last = routable.at(-1)!;
    const endpoints = await resolveRouteEndpoints({
      admin, businessId, technicianId, firstStop: first.waypoint, lastStop: last.waypoint,
    });
    if ((endpoints.origin.type !== "none" && !endpoints.origin.waypoint)
      || (endpoints.destination.type !== "none" && !endpoints.destination.waypoint)) {
      await admin.from("technician_routes").update({
        calculation_status: "failed", encoded_polyline: null,
        driving_distance_meters: null, driving_duration_seconds: null,
        error_code: "route_endpoint_coordinates_missing",
      }).eq("business_id", businessId).eq("route_plan_id", plan.id).eq("technician_id", technicianId);
      summary.skipped += 1;
      continue;
    }
    const calculationWaypoints = [
      ...(endpoints.origin.type !== "first_stop" && endpoints.origin.waypoint ? [endpoints.origin.waypoint] : []),
      ...routable.map((item) => item.waypoint),
      ...(endpoints.destination.type !== "last_stop" && endpoints.destination.waypoint ? [endpoints.destination.waypoint] : []),
    ];
    const routeSignature = signature({
      provider: provider.name,
      travelMode: plan.travel_mode,
      origin: endpoints.origin.waypoint,
      destination: endpoints.destination.waypoint,
      stops: routable.map(({ job, waypoint, duration }) => ({
        id: job.id, latitude: waypoint.latitude, longitude: waypoint.longitude,
        startsAt: job.starts_at, endsAt: job.ends_at, duration: duration.minutes, durationSource: duration.source,
      })),
    });
    const { data: existing } = await admin.from("technician_routes")
      .select("id,calculation_signature,calculation_status,driving_distance_meters,driving_duration_seconds,encoded_polyline")
      .eq("business_id", businessId).eq("route_plan_id", plan.id).eq("technician_id", technicianId).maybeSingle();
    let hasSafeLegGeometry = false;
    if (existing?.calculation_signature === routeSignature && !existing.encoded_polyline && calculationWaypoints.length > 1) {
      const { data: safeLeg } = await admin.from("route_legs").select("id")
        .eq("business_id",businessId).eq("technician_route_id",existing.id)
        .eq("calculation_status","ready").not("encoded_polyline","is",null).limit(1).maybeSingle();
      hasSafeLegGeometry=Boolean(safeLeg);
    }
    if (existing?.calculation_signature === routeSignature && canReuseCalculatedRoute({
      status:existing.calculation_status,
      drivingDistanceMeters:existing.driving_distance_meters,
      drivingDurationSeconds:existing.driving_duration_seconds,
      geometryRequired:calculationWaypoints.length>1,
      aggregatePolyline:existing.encoded_polyline,
      hasSafeLegGeometry,
    })) {
      summary.cached += 1;
      planDistance += existing.driving_distance_meters ?? 0;
      planDuration += existing.driving_duration_seconds ?? 0;
      continue;
    }
    const { data: technicianRoute, error: routeError } = await admin.from("technician_routes").upsert({
      business_id: businessId, route_plan_id: plan.id, technician_id: technicianId,
      origin_type: endpoints.origin.type, origin_label: endpoints.origin.label,
      origin_address_snapshot: endpoints.origin.isPrivate ? null : endpoints.origin.address,
      origin_latitude: endpoints.origin.isPrivate ? null : endpoints.origin.waypoint?.latitude ?? null,
      origin_longitude: endpoints.origin.isPrivate ? null : endpoints.origin.waypoint?.longitude ?? null,
      origin_is_private: endpoints.origin.isPrivate,
      destination_type: endpoints.destination.type, destination_label: endpoints.destination.label,
      destination_address_snapshot: endpoints.destination.isPrivate ? null : endpoints.destination.address,
      destination_latitude: endpoints.destination.isPrivate ? null : endpoints.destination.waypoint?.latitude ?? null,
      destination_longitude: endpoints.destination.isPrivate ? null : endpoints.destination.waypoint?.longitude ?? null,
      destination_is_private: endpoints.destination.isPrivate,
      stop_count: routable.length,
      service_duration_seconds: routable.reduce((total, item) => total + item.duration.minutes * 60, 0),
      technician_display_name_snapshot: technicianCapability?.preferred_name ?? "Technician",
      provider: provider.name, calculation_status: "calculating", calculation_signature: routeSignature,
      encoded_polyline: null, driving_distance_meters: null, driving_duration_seconds: null,
      error_code: null, updated_by: actorUserId,
    }, { onConflict: "business_id,route_plan_id,technician_id" }).select("id").single();
    if (routeError || !technicianRoute) {
      throw new Error(databaseFailure("Technician route could not be saved",routeError));
    }
    await admin.from("route_stops").delete().eq("business_id", businessId).eq("technician_route_id", technicianRoute.id);
    const { data: stops, error: stopsError } = await admin.from("route_stops").insert(routable.map(({ job, location, duration }, index) => {
      const customer = relation(job.customers);
      const service = relation(job.services) as { name?: string; duration_minutes: number | null } | null;
      return ({
      business_id: businessId, route_plan_id: plan.id, technician_route_id: technicianRoute.id,
      job_id: job.id, service_location_id: job.service_location_id, sequence: index + 1,
      job_number_snapshot: job.job_number, job_title_snapshot: job.title,
      customer_display_name_snapshot: customer?.company_name || [customer?.first_name,customer?.last_name].filter(Boolean).join(" ") || "Customer",
      service_name_snapshot: service?.name ?? "Custom work",
      service_location_label_snapshot: location.location_name ?? "Service location",
      planned_arrival_at: job.starts_at, planned_departure_at: job.ends_at,
      appointment_window_start: job.arrival_window_start, appointment_window_end: job.arrival_window_end,
      service_duration_seconds: duration.minutes * 60, service_duration_source: duration.source,
      latitude: Number(location.latitude), longitude: Number(location.longitude),
      address_snapshot: [location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", "),
      calculation_status: "calculating", created_by: actorUserId, updated_by: actorUserId,
    });})).select("id,job_id,sequence");
    if (stopsError || !stops) {
      await admin.from("technician_routes").update({ calculation_status: "failed", error_code: stopsError?.code ?? "stop_write_failed" }).eq("id", technicianRoute.id);
      summary.failed += 1;
      continue;
    }
    if (calculationWaypoints.length === 1) {
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
    const segments = splitRouteWaypoints(calculationWaypoints);
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
      from_route_stop_id: string | null; to_route_stop_id: string | null;
      from_origin_type: string | null; to_destination_type: string | null;
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
          from_route_stop_id: stopByJob.get(leg.fromWaypointId)?.id ?? null,
          to_route_stop_id: stopByJob.get(leg.toWaypointId)?.id ?? null,
          from_origin_type: leg.fromWaypointId === "__start" ? endpoints.origin.type === "technician" ? "technician" : endpoints.origin.type : null,
          to_destination_type: leg.toWaypointId === "__end" ? endpoints.destination.type === "technician" ? "technician" : endpoints.destination.type : null,
          sequence: outcome.segment.startWaypointIndex + localIndex + 1,
          driving_distance_meters: leg.drivingDistanceMeters,
          driving_duration_seconds: leg.drivingDurationSeconds,
          encoded_polyline: (leg.fromWaypointId === "__start" && endpoints.origin.isPrivate)
            || (leg.toWaypointId === "__end" && endpoints.destination.isPrivate) ? null : leg.encodedPolyline,
          provider: segmentResult.provider,
          provider_request_id: segmentResult.providerRequestId,
          calculation_status: "ready" as const, calculated_at: segmentResult.calculatedAt,
          provider_warnings: leg.providerWarnings, error_code: null,
        })));
        continue;
      }
      legRows.push(...outcome.segment.waypoints.slice(0, -1).map((waypoint, localIndex) => ({
        business_id: businessId, technician_route_id: technicianRoute.id,
        from_route_stop_id: stopByJob.get(waypoint.id)?.id ?? null,
        to_route_stop_id: stopByJob.get(outcome.segment.waypoints[localIndex + 1].id)?.id ?? null,
        from_origin_type: waypoint.id === "__start" ? endpoints.origin.type === "technician" ? "technician" : endpoints.origin.type : null,
        to_destination_type: outcome.segment.waypoints[localIndex + 1].id === "__end" ? endpoints.destination.type === "technician" ? "technician" : endpoints.destination.type : null,
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
    const readyTravelByPair = new Map(readyOutcomes.flatMap((outcome) => outcome.result.legs)
      .map((leg) => [`${leg.fromWaypointId}:${leg.toWaypointId}`, leg]));
    let arrivalMs = new Date(first.job.starts_at).getTime();
    let arrivalKnown = true;
    for (let index = 0; index < routable.length; index += 1) {
      const item = routable[index];
      const appointmentStart = item.job.arrival_window_start ? new Date(item.job.arrival_window_start).getTime() : null;
      if (arrivalKnown && appointmentStart !== null) arrivalMs = Math.max(arrivalMs, appointmentStart);
      const serviceSeconds = item.duration.minutes * 60;
      const departureMs = arrivalMs + serviceSeconds * 1000;
      await admin.from("route_stops").update(arrivalKnown ? {
        calculation_status: "ready", error_code: null,
        planned_arrival_at: new Date(arrivalMs).toISOString(),
        planned_departure_at: new Date(departureMs).toISOString(),
      } : {
        calculation_status: "failed", error_code: "prior_segment_failed",
        planned_arrival_at: item.job.starts_at, planned_departure_at: item.job.ends_at,
      }).eq("id", stopByJob.get(item.job.id)!.id);
      const nextJob = routable[index + 1]?.job;
      const nextLeg = nextJob ? readyTravelByPair.get(`${item.job.id}:${nextJob.id}`) : null;
      if (index < routable.length - 1 && !nextLeg) arrivalKnown = false;
      if (arrivalKnown && nextLeg) arrivalMs = departureMs + nextLeg.drivingDurationSeconds * 1000;
    }
    const routeDistance = readyOutcomes.reduce((total, outcome) => total + outcome.result.drivingDistanceMeters, 0);
    const routeDuration = readyOutcomes.reduce((total, outcome) => total + outcome.result.drivingDurationSeconds, 0);
    const routeStatus = failedOutcomes.length ? (readyOutcomes.length ? "partial" : "failed") : "ready";
    const mergedPolyline = routeStatus === "ready" && !endpoints.origin.isPrivate && !endpoints.destination.isPrivate
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
  const { data: routeTotals } = await admin.from("technician_routes")
    .select("driving_distance_meters,driving_duration_seconds")
    .eq("business_id", businessId).eq("route_plan_id", plan.id)
    .in("calculation_status", ["ready", "partial"]);
  planDistance = (routeTotals ?? []).reduce((total, route) => total + Number(route.driving_distance_meters ?? 0), 0);
  planDuration = (routeTotals ?? []).reduce((total, route) => total + Number(route.driving_duration_seconds ?? 0), 0);
  const { data: routeStates } = await admin.from("technician_routes")
    .select("calculation_status").eq("business_id", businessId).eq("route_plan_id", plan.id);
  const hasFailed = (routeStates ?? []).some((route) => route.calculation_status === "failed");
  const hasPartial = (routeStates ?? []).some((route) => route.calculation_status === "partial");
  const hasReady = (routeStates ?? []).some((route) => route.calculation_status === "ready");
  const aggregateStatus = hasFailed || hasPartial
    ? (hasReady || hasPartial ? "partial" : "failed")
    : finalStatus;
  const {error:finalPlanError}=await admin.from("route_plans").update({
    calculation_status: aggregateStatus,
    total_driving_distance_meters: planDistance,
    total_driving_duration_seconds: planDuration,
    calculated_at: new Date().toISOString(),
    calculation_signature: signature({ provider: provider.name, groups: [...groups.keys()] }),
    error_code: aggregateStatus === "failed" ? "no_routes_calculated" : null,
    stale_at: null,
  }).eq("id", plan.id).eq("business_id", businessId);
  if(finalPlanError){
    throw new Error(databaseFailure("Final route plan state could not be saved",finalPlanError));
  }
  const { data: verifiedRoutes, error: verificationError } = await admin.from("technician_routes")
    .select("id,calculation_status,encoded_polyline,stop_count")
    .eq("business_id", businessId).eq("route_plan_id", plan.id);
  if (verificationError) {
    throw new Error(databaseFailure("Calculated routes could not be verified", verificationError));
  }
  if (groups.size > 0 && (verifiedRoutes?.length ?? 0) === 0) {
    throw new Error("Route calculation persisted no technician route records.");
  }
  const durationMs = Date.now() - operationStartedAt;
  const logContext = {
    operation: "daily_route_calculation", businessId, serviceDate,
    provider: provider.name, durationMs, ...summary,
  };
  if (durationMs >= Number(process.env.ROUTE_SLOW_CALCULATION_MS ?? 10000)) {
    console.warn("Slow route calculation", logContext);
  } else {
    console.info("Route calculation completed", logContext);
  }
  return summary;
}
