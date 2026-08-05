import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { formatEstimatedDuration, formatEstimatedMiles } from "@/lib/routing/metrics";
import { hasRouteCapability } from "@/lib/routing/permissions";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";

const dateValue = (value: string | undefined, fallback: string) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

export default async function RouteReportingPage({
  params, searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!hasRouteCapability(role,"view_route_reporting")) redirect("/tech/route");
  const today = dateInTimeZone(new Date(), business.timezone);
  const from = dateValue(query.from, addDays(today, -29));
  const to = dateValue(query.to, today);
  const safeFrom = from <= to ? from : to;
  const safeTo = from <= to ? to : from;
  const start = zonedDateTimeToUtc(safeFrom, "00:00", business.timezone).toISOString();
  const end = zonedDateTimeToUtc(addDays(safeTo, 1), "00:00", business.timezone).toISOString();
  const [{ data: plans, error: planError }, { data: jobs, error: jobError }, { data: auditEvents, error: auditError }] = await Promise.all([
    supabase.from("route_plans")
      .select("id,service_date,calculation_status,total_driving_distance_meters,total_driving_duration_seconds")
      .eq("business_id", business.id).gte("service_date", safeFrom).lte("service_date", safeTo).order("service_date"),
    supabase.from("jobs").select("id,status,assigned_technician_id,starts_at")
      .eq("business_id", business.id).eq("is_deleted", false).gte("starts_at", start).lt("starts_at", end),
    supabase.from("route_audit_events").select("id,event_type,created_at,metadata")
      .eq("business_id",business.id).gte("created_at",start).lt("created_at",end).order("created_at",{ascending:false}).limit(50),
  ]);
  if (planError || jobError) {
    console.error("Route reporting base query failed", {
      businessId: business.id, planCode: planError?.code, jobCode: jobError?.code,
    });
  }
  const planIds = (plans ?? []).map((plan) => plan.id);
  const [{ data: stops }, { data: acceptedSuggestions }] = planIds.length ? await Promise.all([
    supabase.from("route_stops")
      .select("route_plan_id,planned_arrival_at,appointment_window_end")
      .eq("business_id", business.id).in("route_plan_id", planIds),
    supabase.from("route_suggestions")
      .select("route_plan_id,estimated_distance_saved_meters,estimated_time_saved_seconds")
      .eq("business_id", business.id).in("route_plan_id", planIds).eq("status", "accepted"),
  ]) : [{ data: [] }, { data: [] }];
  const routedPlans = (plans ?? []).filter((plan) => ["ready", "partial"].includes(plan.calculation_status));
  const distance = routedPlans.reduce((sum, plan) => sum + Number(plan.total_driving_distance_meters ?? 0), 0);
  const duration = routedPlans.reduce((sum, plan) => sum + Number(plan.total_driving_duration_seconds ?? 0), 0);
  const completed = (jobs ?? []).filter((job) => job.status === "completed").length;
  const unassigned = (jobs ?? []).filter((job) => !job.assigned_technician_id).length;
  const atRisk = (stops ?? []).filter((stop) => stop.planned_arrival_at && stop.appointment_window_end
    && new Date(stop.planned_arrival_at).getTime() > new Date(stop.appointment_window_end).getTime()).length;
  const appliedDistanceSavings = (acceptedSuggestions ?? []).reduce((sum, item) => sum + Number(item.estimated_distance_saved_meters ?? 0), 0);
  const appliedTimeSavings = (acceptedSuggestions ?? []).reduce((sum, item) => sum + Number(item.estimated_time_saved_seconds ?? 0), 0);
  const jobsCount = jobs?.length ?? 0;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content route-reporting">
    <header className="epic3-header"><div><small>Estimated provider route data</small><h1>Route reporting</h1><p>Operational route trends for {business.name}. These are not GPS or odometer measurements.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/dispatch`}>Back to dispatch</Link></header>
    <section className="workspace-panel"><form className="route-report-filters"><label>From<input type="date" name="from" defaultValue={safeFrom}/></label><label>Through<input type="date" name="to" defaultValue={safeTo}/></label><button className="sv-button">Update report</button></form></section>
    {(planError || jobError) && <div className="workspace-notice error">Some route reporting data could not be loaded.</div>}
    <section className="workspace-panel route-metrics"><div className="route-metric-grid">
      <article><span>Estimated route miles</span><strong>{formatEstimatedMiles(distance)}</strong><small>Provider-calculated roads</small></article>
      <article><span>Estimated drive time</span><strong>{formatEstimatedDuration(duration)}</strong><small>{routedPlans.length} calculated route days</small></article>
      <article><span>Miles per completed job</span><strong>{completed ? formatEstimatedMiles(distance / completed) : "Not available"}</strong><small>{completed} completed jobs</small></article>
      <article><span>Unassigned-job rate</span><strong>{jobsCount ? `${((unassigned / jobsCount) * 100).toFixed(1)}%` : "Not available"}</strong><small>{unassigned} of {jobsCount} jobs</small></article>
      <article><span>Appointment-risk rate</span><strong>{(stops?.length ?? 0) ? `${((atRisk / stops!.length) * 100).toFixed(1)}%` : "Not available"}</strong><small>Calculated arrivals after window</small></article>
      <article><span>Applied optimization savings</span><strong>{formatEstimatedMiles(appliedDistanceSavings)}</strong><small>{formatEstimatedDuration(appliedTimeSavings)} estimated</small></article>
    </div></section>
    <section className="workspace-panel"><div className="panel-title"><div><small>Efficiency trend</small><h2>Daily estimated road usage</h2></div></div>
      <div className="route-trend-table"><div className="route-trend-head"><b>Date</b><b>Status</b><b>Estimated miles</b><b>Estimated drive time</b></div>{(plans ?? []).length ? (plans ?? []).map((plan) => <div key={plan.id}><span>{plan.service_date}</span><span>{plan.calculation_status}</span><span>{["ready","partial"].includes(plan.calculation_status) ? formatEstimatedMiles(Number(plan.total_driving_distance_meters ?? 0)) : "Unavailable"}</span><span>{["ready","partial"].includes(plan.calculation_status) ? formatEstimatedDuration(Number(plan.total_driving_duration_seconds ?? 0)) : "Unavailable"}</span></div>) : <p>No calculated routes in this date range.</p>}</div>
    </section>
    <section className="workspace-panel"><div className="panel-title"><div><small>Authorized office audit</small><h2>Recent route activity</h2></div></div>{auditError?<p>Route audit history will be available after the Checkpoint 18 migration is applied.</p>:<div className="route-audit-list">{(auditEvents??[]).length?(auditEvents??[]).map((event)=><article key={event.id}><strong>{event.event_type.replaceAll("_"," ")}</strong><span>{new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:business.timezone}).format(new Date(event.created_at))}</span></article>):<p>No route activity in this date range.</p>}</div>}</section>
  </section></main>;
}
