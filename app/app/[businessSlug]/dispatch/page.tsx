import Link from "next/link";
import { redirect } from "next/navigation";
import DispatchMap, { type DispatchMapJob, type DispatchMapRoute } from "@/components/DispatchMap";
import { canManageCustomers } from "@/lib/access";
import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { conflictingDispatchJobIds, dispatchTechnicianState } from "@/lib/dispatchBoard";
import { routableLocationCoordinates, scheduledStopSequence } from "@/lib/dispatchMap";
import { availableJobTransitions, type JobStatus } from "@/lib/jobStatusTransitions";
import { evaluateRouteWarnings } from "@/lib/routing/warnings";
import { densityCounts, resolveServiceDuration } from "@/lib/routing/serviceDuration";
import { formatEstimatedDuration, formatEstimatedMiles, routeMetrics } from "@/lib/routing/metrics";
import { hasRouteCapability } from "@/lib/routing/permissions";
import { safeRoadGeometries } from "@/lib/routing/geometrySelection";
import { requireWorkspace } from "@/lib/workspace";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { WorkspaceNav } from "../WorkspaceNav";
import { assignDispatchJob, calculateDispatchRoutes, decideDispatchRouteSuggestion, optimizeDispatchRoutes, reorderDispatchRoute, updateDispatchStatus } from "./actions";

type Relation<T> = T | T[] | null;
type DispatchJob = {
  id: string; job_number: number; title: string; status: JobStatus; priority: string;
  starts_at: string | null; ends_at: string | null; arrival_window_start: string | null; arrival_window_end: string | null;
  assigned_technician_id: string | null; service_address: string | null;
  customers: Relation<{ first_name: string; last_name: string; company_name: string | null; phone: string | null }>;
  service_locations: Relation<{ street_address: string; unit: string | null; city: string; state: string; postal_code: string; latitude: number | string | null; longitude: number | string | null; geocoding_status: string | null }>;
  services: Relation<{ name: string; duration_minutes: number | null }>;
};
type Technician = { id: string; display_name: string; phone: string | null; technician_status: string; schedule_color: string; service_areas: string[] };
const relation = <T,>(value: Relation<T>) => Array.isArray(value) ? value[0] ?? null : value;
const validDate = (value: string | undefined, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

function DispatchCard({ job, slug, date, technicians, conflict, canEdit, timeZone, routePlanId, planVersion }: {
  job: DispatchJob; slug: string; date: string; technicians: Technician[]; conflict: boolean; canEdit: boolean; timeZone: string;
  routePlanId: string | null; planVersion: number | null;
}) {
  const customer = relation(job.customers), location = relation(job.service_locations), service = relation(job.services);
  const time = job.starts_at ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(job.starts_at)) : "Unscheduled";
  const arrival = job.arrival_window_start ? `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(job.arrival_window_start))}–${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(job.arrival_window_end!))}` : null;
  const address = location ? [location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", ") : job.service_address;
  const late = Boolean(job.starts_at && new Date(job.starts_at).getTime() < Date.now() && !["arrived", "in_progress", "completed", "canceled"].includes(job.status));
  const transitions = availableJobTransitions(job.status);
  return <article className={`dispatch-card priority-${job.priority} ${late ? "late" : ""} ${conflict ? "conflict" : ""}`}>
    <div className="dispatch-card-head"><span>{time}</span><span className={`job-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span></div>
    <Link href={`/app/${slug}/jobs/${job.id}`}><strong>#{job.job_number} · {job.title}</strong></Link>
    <p>{customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "No customer"}</p>
    <small>{service?.name || "Custom work"} · {job.priority} priority</small>
    {arrival && <small>Arrival window: {arrival}</small>}
    {address && <small className="dispatch-address">{address}</small>}
    <div className="dispatch-flags">{late && <b>Late</b>}{conflict && <b>Schedule conflict</b>}</div>
    <div className="dispatch-contact">{customer?.phone && <a href={`tel:${customer.phone}`}>Call customer</a>}{address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Directions</a>}</div>
    {canEdit && <div className="dispatch-controls"><form action={assignDispatchJob.bind(null, slug, job.id)}><input type="hidden" name="date" value={date}/><input type="hidden" name="routePlanId" value={routePlanId ?? ""}/><input type="hidden" name="planVersion" value={planVersion ?? ""}/><label>Assign<select name="technicianId" defaultValue={job.assigned_technician_id ?? ""}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id} disabled={technician.technician_status === "off_duty"}>{technician.display_name}{technician.technician_status === "off_duty" ? " (off duty)" : ""}</option>)}</select></label><button className="text-button">Save</button></form>{transitions.length > 0 && <form action={updateDispatchStatus.bind(null, slug, job.id)}><input type="hidden" name="date" value={date}/><label>Next status<select name="status" defaultValue={transitions[0]}>{transitions.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><button className="text-button">Update</button></form>}</div>}
  </article>;
}

export default async function DispatchPage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!hasRouteCapability(role,"view_all_routes")) redirect("/tech/route");
  const canEdit = canManageCustomers(role);
  const routingSupabase = canEdit ? getSupabaseAdmin() ?? supabase : supabase;
  const today = dateInTimeZone(new Date(), business.timezone);
  const date = validDate(query.date, today);
  const start = zonedDateTimeToUtc(date, "00:00", business.timezone).toISOString();
  const end = zonedDateTimeToUtc(addDays(date, 1), "00:00", business.timezone).toISOString();
  const [{ data: jobRows, error }, { data: technicianRows }, { data: routePlan, error: routePlanError }] = await Promise.all([
    supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,ends_at,arrival_window_start,arrival_window_end,assigned_technician_id,service_address,customers!jobs_customer_tenant_fk(first_name,last_name,company_name,phone),service_locations!jobs_service_location_tenant_fk(street_address,unit,city,state,postal_code,latitude,longitude,geocoding_status),services!jobs_service_tenant_fk(name,duration_minutes)")
      .eq("business_id", business.id).eq("is_deleted", false).gte("starts_at", start).lt("starts_at", end).not("status", "in", '("canceled","declined")').order("starts_at"),
    supabase.from("technician_profiles").select("id,display_name,phone,technician_status,schedule_color,service_areas").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).order("display_name"),
    routingSupabase.from("route_plans").select("id,calculation_status,version,calculation_revision,updated_at,updated_by").eq("business_id", business.id).eq("service_date", date).maybeSingle(),
  ]);
  if (error) {
    console.error("Dispatch board query failed", { code: error.code, businessId: business.id });
    throw new Error("The dispatch board could not be loaded.");
  }
  const jobs = (jobRows ?? []) as unknown as DispatchJob[];
  const technicians = (technicianRows ?? []) as Technician[];
  if (routePlanError) {
    console.error("Dispatch route plan query failed", { code: routePlanError.code, businessId: business.id });
  }
  const { data: persistedRoutes, error: persistedRouteError } = routePlan
    ? await routingSupabase.from("technician_routes").select("id,technician_id,encoded_polyline,stop_count,service_duration_seconds,calculation_status,origin_type,origin_label,origin_is_private,destination_label,destination_is_private,driving_distance_meters,driving_duration_seconds").eq("business_id", business.id).eq("route_plan_id", routePlan.id)
    : { data: null, error: null };
  if (persistedRouteError) {
    console.error("Dispatch technician routes query failed", {
      code: persistedRouteError.code,
      message: persistedRouteError.message,
      details: persistedRouteError.details,
      hint: persistedRouteError.hint,
      businessId: business.id,
    });
  }
  const routeIds = (persistedRoutes ?? []).map((route) => route.id);
  const { data: routeSuggestions, error: suggestionError } = routePlan
    ? await routingSupabase.from("route_suggestions").select("id,summary,estimated_distance_saved_meters,estimated_time_saved_seconds,created_at").eq("business_id", business.id).eq("route_plan_id", routePlan.id).eq("status", "pending").order("created_at", { ascending: false })
    : { data: null, error: null };
  if (suggestionError) console.error("Route suggestions query failed", { code: suggestionError.code, businessId: business.id });
  const { data: densityPolicy } = await routingSupabase.from("business_routing_policies").select("default_service_duration_minutes").eq("business_id", business.id).maybeSingle();
  const [{ data: persistedStops, error: persistedStopError }, { data: persistedLegs, error: persistedLegError }] = routeIds.length
    ? await Promise.all([
      routingSupabase.from("route_stops").select("id,technician_route_id,job_id,sequence,planned_arrival_at,planned_departure_at,is_locked").eq("business_id", business.id).in("technician_route_id", routeIds),
      routingSupabase.from("route_legs").select("technician_route_id,to_route_stop_id,driving_distance_meters,driving_duration_seconds,encoded_polyline,calculation_status,sequence").eq("business_id", business.id).in("technician_route_id", routeIds).order("sequence"),
    ])
    : [{ data: null, error: null }, { data: null, error: null }];
  if (persistedStopError) {
    console.error("Dispatch route stops query failed", { code: persistedStopError.code, businessId: business.id });
  }
  if (persistedLegError) {
    console.error("Dispatch route legs query failed", { code: persistedLegError.code, businessId: business.id });
  }
  const conflicts = conflictingDispatchJobIds(jobs);
  const unassigned = jobs.filter((job) => !job.assigned_technician_id);
  const routeByTechnician = new Map((persistedRoutes ?? []).map((route) => [route.technician_id, route]));
  const stopByJob = new Map((persistedStops ?? []).map((stop) => [stop.job_id, stop]));
  const legByStop = new Map((persistedLegs ?? []).filter((leg) => leg.to_route_stop_id).map((leg) => [leg.to_route_stop_id!, leg]));
  const mapRoutes: DispatchMapRoute[] = technicians
    .filter((technician) => jobs.some((job) => job.assigned_technician_id === technician.id))
    .map((technician) => {
      const persisted = routeByTechnician.get(technician.id);
      const geometry = safeRoadGeometries(
        persisted?.encoded_polyline,
        (persistedLegs ?? []).filter((leg) => leg.technician_route_id === persisted?.id),
      );
      return {
        technicianRouteId: persisted?.id ?? null,
        technicianId: technician.id,
        technicianName: technician.display_name,
        technicianStatus: technician.technician_status,
        color: technician.schedule_color,
        encodedPolyline: geometry.encodedPolyline,
        encodedPolylines: geometry.encodedPolylines,
        stopCount: persisted?.stop_count ?? jobs.filter((job) => job.assigned_technician_id === technician.id).length,
        calculationStatus: persisted?.calculation_status ?? routePlan?.calculation_status ?? "not_calculated",
        originLabel: persisted?.origin_is_private ? "Private technician start" : persisted?.origin_label || "Start location not configured",
        destinationLabel: persisted?.destination_is_private ? "Private technician end" : persisted?.destination_label || "End location not configured",
        drivingDistanceMeters: persisted && ["ready", "partial"].includes(persisted.calculation_status) ? persisted.driving_distance_meters : null,
        drivingDurationSeconds: persisted && ["ready", "partial"].includes(persisted.calculation_status) ? persisted.driving_duration_seconds : null,
      };
    });
  const sequenceByJob = scheduledStopSequence(
    jobs.map((job) => ({ id: job.id, assignedTechnicianId: job.assigned_technician_id })),
    technicians.map((technician) => technician.id),
  );
  const mapJobs: DispatchMapJob[] = jobs.map((job) => {
    const customer = relation(job.customers);
    const location = relation(job.service_locations);
    const technician = technicians.find((candidate) => candidate.id === job.assigned_technician_id) ?? null;
    const address = location
      ? [location.street_address,location.unit,location.city,location.state,location.postal_code].filter(Boolean).join(", ")
      : job.service_address;
    const coordinates = routableLocationCoordinates({
      geocodingStatus: location?.geocoding_status,
      latitude: location?.latitude,
      longitude: location?.longitude,
    });
    const persistedStop = stopByJob.get(job.id);
    const persistedLeg = persistedStop ? legByStop.get(persistedStop.id) : null;
    return {
      id: job.id,
      jobNumber: job.job_number,
      title: job.title,
      status: job.status,
      scheduledLabel: job.starts_at ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(job.starts_at)) : "Unscheduled",
      arrivalWindow: job.arrival_window_start ? `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(job.arrival_window_start))}–${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(job.arrival_window_end!))}` : null,
      customerName: customer?.company_name || [customer?.first_name,customer?.last_name].filter(Boolean).join(" ") || "No customer",
      address,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      geocodingStatus: location?.geocoding_status ?? null,
      technicianId: technician?.id ?? null,
      technicianName: technician?.display_name ?? null,
      technicianColor: technician?.schedule_color ?? null,
      sequence: persistedStop?.sequence ?? sequenceByJob.get(job.id) ?? null,
      estimatedArrivalLabel: persistedStop?.planned_arrival_at ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(persistedStop.planned_arrival_at)) : null,
      drivingDistanceMeters: persistedLeg?.calculation_status === "ready" ? persistedLeg.driving_distance_meters : null,
      drivingDurationSeconds: persistedLeg?.calculation_status === "ready" ? persistedLeg.driving_duration_seconds : null,
      isLocked: persistedStop?.is_locked ?? false,
      href: `/app/${businessSlug}/jobs/${job.id}`,
      hasConflict: conflicts.has(job.id),
    };
  });
  const routeWarnings = evaluateRouteWarnings({
    routes: technicians.filter((technician) => jobs.some((job) => job.assigned_technician_id === technician.id)).map((technician) => {
      const persisted = routeByTechnician.get(technician.id);
      return {
        technicianId: technician.id, technicianName: technician.display_name,
        calculationStatus: persisted?.calculation_status ?? routePlan?.calculation_status ?? "not_calculated",
        originType: persisted?.origin_type ?? null,
        drivingDistanceMeters: persisted && ["ready", "partial"].includes(persisted.calculation_status) ? persisted.driving_distance_meters : null,
        drivingDurationSeconds: persisted && ["ready", "partial"].includes(persisted.calculation_status) ? persisted.driving_duration_seconds : null,
      };
    }),
    stops: jobs.map((job) => {
      const location = relation(job.service_locations);
      const coordinates = routableLocationCoordinates({ geocodingStatus: location?.geocoding_status, latitude: location?.latitude, longitude: location?.longitude });
      const persistedStop = stopByJob.get(job.id);
      const persistedLeg = persistedStop ? legByStop.get(persistedStop.id) : null;
      return {
        jobId: job.id, jobNumber: job.job_number, title: job.title,
        technicianId: job.assigned_technician_id,
        sequence: persistedStop?.sequence ?? sequenceByJob.get(job.id) ?? null,
        startsAt: job.starts_at, endsAt: job.ends_at,
        arrivalWindowStart: job.arrival_window_start, arrivalWindowEnd: job.arrival_window_end,
        plannedArrivalAt: persistedStop?.planned_arrival_at ?? null,
        hasCoordinates: coordinates !== null, hasScheduleConflict: conflicts.has(job.id),
        inboundDrivingDurationSeconds: persistedLeg?.calculation_status === "ready" ? persistedLeg.driving_duration_seconds : null,
      };
    }),
  });
  const durationLabels = jobs.map((job) => {
    const minutes = resolveServiceDuration({
      serviceMinutes: relation(job.services)?.duration_minutes,
      businessDefaultMinutes: densityPolicy?.default_service_duration_minutes,
    }).minutes;
    return minutes <= 30 ? "30 min or less" : minutes <= 60 ? "31–60 min" : minutes <= 120 ? "61–120 min" : "Over 2 hours";
  });
  const densityGroups = [
    { label: "ZIP code", values: jobs.map((job) => relation(job.service_locations)?.postal_code) },
    { label: "City", values: jobs.map((job) => relation(job.service_locations)?.city) },
    { label: "Service area", values: jobs.map((job) => technicians.find((technician) => technician.id === job.assigned_technician_id)?.service_areas?.join(", ")) },
    { label: "Technician", values: jobs.map((job) => technicians.find((technician) => technician.id === job.assigned_technician_id)?.display_name ?? "Unassigned") },
    { label: "Appointment window", values: jobs.map((job) => job.arrival_window_start ? new Intl.DateTimeFormat("en-US", { timeZone: business.timezone, hour: "numeric" }).format(new Date(job.arrival_window_start)) : "No window") },
    { label: "Job duration", values: durationLabels },
  ];
  const jobsAtRisk = new Set(routeWarnings.filter((warning) => warning.jobId && warning.severity !== "info").map((warning) => warning.jobId)).size;
  const dailyMetrics = routeMetrics({
    totalJobs: jobs.length,
    assignedJobs: jobs.length - unassigned.length,
    jobsAtRisk,
    stopsMissingCoordinates: mapJobs.filter((job) => job.latitude === null || job.longitude === null).length,
    routes: (persistedRoutes ?? []).map((route) => ({
      calculationStatus: route.calculation_status,
      drivingDistanceMeters: route.driving_distance_meters,
      drivingDurationSeconds: route.driving_duration_seconds,
      stopCount: route.stop_count,
      serviceDurationSeconds: route.service_duration_seconds,
      warningCount: routeWarnings.filter((warning) => warning.technicianId === route.technician_id).length,
    })),
    potentialDistanceSavingsMeters: (routeSuggestions ?? []).reduce((sum, suggestion) => sum + Number(suggestion.estimated_distance_saved_meters ?? 0), 0),
    potentialTimeSavingsSeconds: (routeSuggestions ?? []).reduce((sum, suggestion) => sum + Number(suggestion.estimated_time_saved_seconds ?? 0), 0),
  });
  const routeTime = (value: string | null | undefined) => value
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(value))
    : "Not available";
  const hrefFor = (nextDate: string) => `/app/${businessSlug}/dispatch?date=${nextDate}`;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content dispatch-page">
    <header className="epic3-header"><div><small>Field service operations</small><h1>Dispatch board</h1><p>Coordinate today’s field work in {business.timezone}.</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/dispatch/reporting`}>Route reporting</Link><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/schedule?date=${date}&view=day`}>Open schedule</Link></div></header>
    {query.error && <div className="workspace-notice error">{query.error}{query.error.includes("changed while you were editing") && <> <Link href={`/app/${businessSlug}/dispatch?date=${date}`}>Refresh latest plan</Link></>}</div>}{query.success && <div className="workspace-notice success">{query.success}</div>}
    {persistedRouteError && <div className="workspace-notice error">Saved routes could not be loaded ({persistedRouteError.code}): {persistedRouteError.message}</div>}
    {!persistedRouteError && routePlan?.calculation_status === "ready" && (persistedRoutes?.length ?? 0) === 0 && <div className="workspace-notice error">The route plan is marked ready but contains no technician routes. Recalculate the selected date to rebuild its route records.</div>}
    <section className="workspace-panel dispatch-toolbar"><div><Link aria-label="Previous day" href={hrefFor(addDays(date, -1))}>‹</Link><Link className="sv-button sv-secondary" href={hrefFor(today)}>Today</Link><Link aria-label="Next day" href={hrefFor(addDays(date, 1))}>›</Link></div><form><label>Date<input name="date" type="date" defaultValue={date}/></label><button className="sv-button">Go</button></form><strong>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00Z`))}</strong>{canEdit&&<><form action={calculateDispatchRoutes.bind(null,businessSlug)}><input type="hidden" name="date" value={date}/><button className="sv-button" type="submit">{routePlan?.calculation_status==="ready"?"Recalculate roads":"Calculate road routes"}</button></form>{routePlan?.calculation_status==="ready"&&<form action={optimizeDispatchRoutes.bind(null,businessSlug)}><input type="hidden" name="date" value={date}/><input type="hidden" name="routePlanId" value={routePlan.id}/><input type="hidden" name="planVersion" value={routePlan.version}/><button className="sv-button sv-secondary" type="submit">Optimize routes</button></form>}</>}</section>
    {(routeSuggestions?.length ?? 0)>0&&<section className="workspace-panel dispatch-suggestions"><div className="panel-title"><div><small>Human approval required</small><h2>Route suggestions</h2></div><span>{routeSuggestions!.length}</span></div><div>{routeSuggestions!.map((suggestion)=><article key={suggestion.id}><div><strong>{suggestion.summary}</strong><p>Current plan remains unchanged until you accept. Based only on calculated Google road routes.</p><small>{suggestion.estimated_distance_saved_meters ? `${(suggestion.estimated_distance_saved_meters/1609.344).toFixed(1)} potential driving miles` : "No mileage savings claimed"} · {suggestion.estimated_time_saved_seconds ? `${Math.round(suggestion.estimated_time_saved_seconds/60)} potential driving minutes` : "No time savings claimed"}</small></div><form action={decideDispatchRouteSuggestion.bind(null,businessSlug,suggestion.id)}><input type="hidden" name="date" value={date}/><input type="hidden" name="planVersion" value={routePlan!.version}/><button name="decision" value="dismissed" className="sv-button sv-secondary">Dismiss</button><button name="decision" value="accepted" className="sv-button">Accept and recalculate</button></form></article>)}</div></section>}
    <section className="workspace-panel route-metrics"><div className="panel-title"><div><small>Provider route estimates</small><h2>Daily route metrics</h2><p>Mileage and travel time are estimated from calculated road routes, not GPS or odometer readings.</p></div></div><div className="route-metric-grid">
      <article><span>Total jobs</span><strong>{dailyMetrics.totalJobs}</strong><small>{dailyMetrics.assignedJobs} assigned · {dailyMetrics.unassignedJobs} unassigned</small></article>
      <article><span>Estimated driving</span><strong>{formatEstimatedMiles(dailyMetrics.drivingDistanceMeters)}</strong><small>{formatEstimatedDuration(dailyMetrics.drivingDurationSeconds)} total</small></article>
      <article><span>Average between stops</span><strong>{dailyMetrics.averageDriveSeconds === null ? "Not available" : formatEstimatedDuration(dailyMetrics.averageDriveSeconds)}</strong><small>Provider-calculated legs only</small></article>
      <article><span>Needs attention</span><strong>{dailyMetrics.jobsAtRisk}</strong><small>{dailyMetrics.routesWithWarnings} routes with warnings · {dailyMetrics.stopsMissingCoordinates} unmapped</small></article>
      <article><span>Potential savings</span><strong>{dailyMetrics.potentialDistanceSavingsMeters ? formatEstimatedMiles(dailyMetrics.potentialDistanceSavingsMeters) : "None identified"}</strong><small>{dailyMetrics.potentialTimeSavingsSeconds ? formatEstimatedDuration(dailyMetrics.potentialTimeSavingsSeconds) : "Pending suggestions only"}</small></article>
    </div><div className="technician-metrics">{(persistedRoutes ?? []).map((route) => {
      const technician = technicians.find((item) => item.id === route.technician_id);
      const routeStops = (persistedStops ?? []).filter((stop) => stop.technician_route_id === route.id).sort((a,b) => a.sequence-b.sequence);
      const warningCount = routeWarnings.filter((warning) => warning.technicianId === route.technician_id).length;
      const workSeconds = route.service_duration_seconds + Number(route.driving_duration_seconds ?? 0);
      return <article key={route.id}><header><strong>{technician?.display_name ?? "Technician"}</strong><span>{route.stop_count} stops</span></header><dl>
        <div><dt>Estimated driving</dt><dd>{route.driving_distance_meters === null ? "Unavailable" : formatEstimatedMiles(route.driving_distance_meters)}</dd></div>
        <div><dt>Estimated drive time</dt><dd>{route.driving_duration_seconds === null ? "Unavailable" : formatEstimatedDuration(route.driving_duration_seconds)}</dd></div>
        <div><dt>Scheduled service</dt><dd>{formatEstimatedDuration(route.service_duration_seconds)}</dd></div>
        <div><dt>Route window</dt><dd>{routeTime(routeStops[0]?.planned_arrival_at)}–{routeTime(routeStops.at(-1)?.planned_departure_at)}</dd></div>
        <div><dt>Warnings</dt><dd>{warningCount}</dd></div>
        <div><dt>Planned utilization</dt><dd>{workSeconds ? formatEstimatedDuration(workSeconds) : "Not available"}</dd></div>
      </dl></article>;
    })}</div></section>
    <section className="workspace-panel dispatch-density"><div className="panel-title"><div><small>Route concentration</small><h2>Today’s route density</h2><p>Operational counts only—no optimization savings are inferred.</p></div></div><div>{densityGroups.map((group)=><article key={group.label}><h3>{group.label}</h3>{densityCounts(group.values).slice(0,5).map(item=><div key={item.label}><span>{item.label}</span><b>{item.count}</b></div>)}</article>)}</div></section>
    <DispatchMap apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} jobs={mapJobs} routes={mapRoutes} warnings={routeWarnings} date={date} canReorder={canEdit} reorderAction={reorderDispatchRoute.bind(null,businessSlug)} planVersion={routePlan?.version ?? null} calculationRevision={routePlan?.calculation_revision ?? null} planUpdatedAt={routePlan?.updated_at ?? null}/>
    <div className="dispatch-list-heading"><div><small>Map-independent controls</small><h2>Dispatch assignments</h2></div><p>Assignment, status, contact, and schedule controls remain available if the map provider is unavailable.</p></div>
    <div className="dispatch-board">
      <section className="dispatch-column unassigned"><header><div><span className="dispatch-avatar">?</span><div><h2>Unassigned</h2><small>{unassigned.length} jobs</small></div></div></header><div className="dispatch-card-list">{unassigned.length ? unassigned.map((job) => <DispatchCard key={job.id} job={job} slug={businessSlug} date={date} technicians={technicians} conflict={conflicts.has(job.id)} canEdit={canEdit} timeZone={business.timezone} routePlanId={routePlan?.id ?? null} planVersion={routePlan?.version ?? null}/>) : <div className="dispatch-empty">No unassigned jobs.</div>}</div></section>
      {technicians.map((technician) => {
        const assigned = jobs.filter((job) => job.assigned_technician_id === technician.id);
        const state = dispatchTechnicianState(technician.technician_status, assigned.map((job) => job.status));
        return <section className="dispatch-column" key={technician.id}><header style={{ borderTopColor: technician.schedule_color }}><div><span className="dispatch-avatar" style={{ background: technician.schedule_color }}>{technician.display_name.slice(0, 1)}</span><div><h2>{technician.display_name}</h2><small>{assigned.length} jobs</small></div></div><span className={`technician-state ${state}`}>{state.replaceAll("_", " ")}</span></header><div className="dispatch-card-list">{assigned.length ? assigned.map((job) => <DispatchCard key={job.id} job={job} slug={businessSlug} date={date} technicians={technicians} conflict={conflicts.has(job.id)} canEdit={canEdit} timeZone={business.timezone} routePlanId={routePlan?.id ?? null} planVersion={routePlan?.version ?? null}/>) : <div className="dispatch-empty">No jobs assigned.</div>}</div></section>;
      })}
    </div>
  </section></main>;
}
