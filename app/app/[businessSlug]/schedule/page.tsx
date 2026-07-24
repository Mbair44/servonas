import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { jobStatuses } from "@/lib/jobValidation";
import { calendarDays, calendarPlacement } from "@/lib/scheduleCalendar";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import { updateScheduledJob } from "./actions";

type JobRow = {
  id: string; job_number: number; title: string; status: string; priority: string;
  starts_at: string | null; ends_at: string | null; estimated_duration_minutes: number | null;
  assigned_technician_id: string | null; service_address: string | null;
  customers: { first_name: string; last_name: string; company_name: string | null } | { first_name: string; last_name: string; company_name: string | null }[] | null;
  service_locations: { city: string; state: string } | { city: string; state: string }[] | null;
  services: { name: string } | { name: string }[] | null;
  technician_profiles: { display_name: string; schedule_color: string | null } | { display_name: string; schedule_color: string | null }[] | null;
};
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const validDate = (value: string | undefined, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
const localInput = (value: string | null, timeZone: string) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};

function ScheduleJobCard({ job, slug, timeZone, technicians, returnPath, compact = false }: {
  job: JobRow; slug: string; timeZone: string; technicians: { id: string; display_name: string }[]; returnPath: string; compact?: boolean;
}) {
  const customer = relation(job.customers), service = relation(job.services), technician = relation(job.technician_profiles), location = relation(job.service_locations);
  const duration = job.estimated_duration_minutes || (job.starts_at && job.ends_at ? Math.round((new Date(job.ends_at).getTime() - new Date(job.starts_at).getTime()) / 60_000) : 60);
  const time = job.starts_at ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(job.starts_at)) : "Unscheduled";
  return <details className={`schedule-job ${job.status} ${compact ? "compact" : ""}`} style={{ borderLeftColor: technician?.schedule_color || "#6255d9" }}>
    <summary><span>{time}</span><strong>#{job.job_number} · {job.title}</strong><small>{customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "No customer"}</small><small>{service?.name || "Custom work"} · {technician?.display_name || "Unassigned"}</small>{!compact && <small>{location ? `${location.city}, ${location.state}` : job.service_address || "No address"} · {job.priority}</small>}</summary>
    <div className="schedule-popover"><Link href={`/app/${slug}/jobs/${job.id}`}>Open job details</Link><form action={updateScheduledJob.bind(null, slug, job.id)}>
      <input type="hidden" name="returnPath" value={returnPath}/>
      <label>Start<input required name="startsAt" type="datetime-local" defaultValue={localInput(job.starts_at, timeZone)}/></label>
      <label>Duration<input required name="durationMinutes" type="number" min="15" step="15" defaultValue={duration}/></label>
      <label>Technician<select name="technicianId" defaultValue={job.assigned_technician_id ?? ""}><option value="">Unassigned</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
      <button className="sv-button">Save schedule</button>
    </form></div>
  </details>;
}

export default async function SchedulePage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const today = dateInTimeZone(new Date(), business.timezone);
  const selectedDate = validDate(query.date, today);
  const view = query.view === "day" ? "day" : "week";
  const days = calendarDays(selectedDate, view);
  const rangeEndDate = addDays(days.at(-1) ?? selectedDate, 1);
  const rangeStart = zonedDateTimeToUtc(days[0], "00:00", business.timezone).toISOString();
  const rangeEnd = zonedDateTimeToUtc(rangeEndDate, "00:00", business.timezone).toISOString();
  let jobsQuery = supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,ends_at,estimated_duration_minutes,assigned_technician_id,service_address,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),service_locations!jobs_service_location_tenant_fk(city,state),services!jobs_service_tenant_fk(name),technician_profiles!jobs_technician_tenant_fk(display_name,schedule_color)")
    .eq("business_id", business.id).eq("is_deleted", false).gte("starts_at", rangeStart).lt("starts_at", rangeEnd).neq("status", "canceled");
  if (query.status && query.status !== "all") jobsQuery = jobsQuery.eq("status", query.status);
  if (query.technician === "unassigned") jobsQuery = jobsQuery.is("assigned_technician_id", null);
  else if (query.technician) jobsQuery = jobsQuery.eq("assigned_technician_id", query.technician);
  const [{ data: jobs, error }, { data: technicians }, { data: availability }, { data: unassigned }] = await Promise.all([
    jobsQuery.order("starts_at"),
    supabase.from("technician_profiles").select("id,display_name,schedule_color").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).order("display_name"),
    supabase.from("booking_availability").select("start_time,end_time").eq("business_id", business.id).eq("active", true),
    supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,ends_at,estimated_duration_minutes,assigned_technician_id,service_address,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),service_locations!jobs_service_location_tenant_fk(city,state),services!jobs_service_tenant_fk(name),technician_profiles!jobs_technician_tenant_fk(display_name,schedule_color)")
      .eq("business_id", business.id).eq("is_deleted", false).is("assigned_technician_id", null).not("status", "in", '("completed","canceled","declined")').order("starts_at", { ascending: true, nullsFirst: true }).limit(30),
  ]);
  if (error) {
    console.error("Schedule query failed", { code: error.code, businessId: business.id });
    throw new Error("The schedule could not be loaded.");
  }
  const startHour = Math.max(0, Math.min(23, Math.floor(Math.min(...(availability?.map((item) => Number(item.start_time.slice(0, 2))) ?? [7]), 7))));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(Math.max(...(availability?.map((item) => Number(item.end_time.slice(0, 2)) + Number(item.end_time.slice(3, 5)) / 60) ?? [19]), 19))));
  const pixelsPerMinute = 1.15;
  const calendarHeight = (endHour - startHour) * 60 * pixelsPerMinute;
  const queryParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value && key !== "error" && key !== "success") queryParams.set(key, value); });
  queryParams.set("date", selectedDate); queryParams.set("view", view);
  const returnPath = `/app/${businessSlug}/schedule?${queryParams.toString()}`;
  const navigationStep = view === "week" ? 7 : 1;
  const hrefFor = (date: string) => {
    const paramsCopy = new URLSearchParams(queryParams); paramsCopy.set("date", date);
    return `/app/${businessSlug}/schedule?${paramsCopy.toString()}`;
  };
  const canEdit = canManageCustomers(role);
  const scheduleJobs = (jobs ?? []) as unknown as JobRow[];
  const unassignedJobs = (unassigned ?? []) as unknown as JobRow[];
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content schedule-page">
    <header className="epic3-header"><div><small>Field service operations</small><h1>Schedule</h1><p>Times are displayed in {business.timezone}.</p></div>{canEdit && <Link className="sv-button" href={`/app/${businessSlug}/jobs/new`}>Add job</Link>}</header>
    {query.error && <div className="workspace-notice error">{query.error}</div>}{query.success && <div className="workspace-notice success">{query.success}</div>}
    <section className="workspace-panel schedule-toolbar"><div className="schedule-navigation"><Link aria-label={`Previous ${view}`} href={hrefFor(addDays(selectedDate, -navigationStep))}>‹</Link><Link className="sv-button sv-secondary" href={hrefFor(today)}>Today</Link><Link aria-label={`Next ${view}`} href={hrefFor(addDays(selectedDate, navigationStep))}>›</Link></div>
      <form><label>Date<input name="date" type="date" defaultValue={selectedDate}/></label><label>View<select name="view" defaultValue={view}><option value="day">Day</option><option value="week">Week</option></select></label><label>Technician<select name="technician" defaultValue={query.technician ?? ""}><option value="">All technicians</option><option value="unassigned">Unassigned only</option>{technicians?.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>Status<select name="status" defaultValue={query.status ?? "all"}><option value="all">All active statuses</option>{jobStatuses.filter((status) => status !== "canceled").map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><button className="sv-button">Apply</button></form>
    </section>
    <div className="schedule-layout"><section className="workspace-panel schedule-calendar-panel"><div className={`schedule-calendar ${view}`}>
      <div className="schedule-corner"/>{days.map((day) => <div className={`schedule-day-heading ${day === today ? "today" : ""}`} key={day}><strong>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${day}T12:00:00Z`))}</strong><span>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`))}</span></div>)}
      <div className="schedule-time-axis" style={{ height: calendarHeight }}>{Array.from({ length: endHour - startHour + 1 }, (_, index) => <span key={index} style={{ top: index * 60 * pixelsPerMinute }}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, startHour + index)))}</span>)}</div>
      {days.map((day) => {
        const dayJobs = scheduleJobs.filter((job) => job.starts_at && dateInTimeZone(new Date(job.starts_at), business.timezone) === day);
        return <div className="schedule-day-column" key={day} style={{ height: calendarHeight }}>
          {Array.from({ length: endHour - startHour + 1 }, (_, index) => <i key={index} style={{ top: index * 60 * pixelsPerMinute }}/>)}
          {dayJobs.map((job) => {
            const placement = calendarPlacement(job.starts_at!, job.ends_at, business.timezone, startHour, endHour);
            return <div className="schedule-positioned-job" key={job.id} style={{ top: placement.top * pixelsPerMinute, minHeight: placement.height * pixelsPerMinute }}><ScheduleJobCard job={job} slug={businessSlug} timeZone={business.timezone} technicians={technicians ?? []} returnPath={returnPath}/></div>;
          })}
        </div>;
      })}
    </div></section>
    <aside className="workspace-panel unassigned-panel"><div><span className="sv-kicker">Needs dispatch</span><h2>Unassigned jobs</h2><p>{unassignedJobs.length} jobs need a technician.</p></div><div className="unassigned-list">{unassignedJobs.length ? unassignedJobs.map((job) => <ScheduleJobCard key={job.id} job={job} slug={businessSlug} timeZone={business.timezone} technicians={technicians ?? []} returnPath={returnPath} compact/>) : <div className="sv-empty"><p>All active jobs are assigned.</p></div>}</div></aside></div>
  </section></main>;
}
