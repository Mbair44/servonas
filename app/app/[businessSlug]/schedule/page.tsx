import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { jobStatuses } from "@/lib/jobValidation";
import { calendarDays, calendarPlacement, ScheduleView, shiftCalendarMonth } from "@/lib/scheduleCalendar";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import { updateScheduledJob } from "./actions";
import {AddJobDrawer} from "@/components/AddJobDrawer";

type JobRow = {
  id: string; job_number: number; title: string; status: string; priority: string;
  starts_at: string | null; ends_at: string | null; estimated_duration_minutes: number | null;
  assigned_technician_id: string | null; service_address: string | null;
  technician_ids?: string[];
  customers: { first_name: string; last_name: string; company_name: string | null } | { first_name: string; last_name: string; company_name: string | null }[] | null;
  service_locations: { city: string; state: string } | { city: string; state: string }[] | null;
  services: { name: string } | { name: string }[] | null;
};
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const validDate = (value: string | undefined, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
const localInput = (value: string | null, timeZone: string) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};

function ScheduleJobCard({ job, slug, timeZone, technicians, returnPath, compact = false, month = false, canEdit }: {
  job: JobRow; slug: string; timeZone: string; technicians: { id: string; preferred_name: string; schedule_color:string|null }[]; returnPath: string; compact?: boolean; month?: boolean; canEdit: boolean;
}) {
  const customer = relation(job.customers), service = relation(job.services), location = relation(job.service_locations);
  const assignedTechnicians=(job.technician_ids??(job.assigned_technician_id?[job.assigned_technician_id]:[])).map(id=>technicians.find(item=>item.id===id)).filter(Boolean);
  const technician=assignedTechnicians[0];
  const duration = job.estimated_duration_minutes || (job.starts_at && job.ends_at ? Math.round((new Date(job.ends_at).getTime() - new Date(job.starts_at).getTime()) / 60_000) : 60);
  const time = job.starts_at ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(job.starts_at)) : "Unscheduled";
  const customerName = customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "No customer";
  return <details className={`schedule-job ${job.status} ${compact ? "compact" : ""} ${month ? "month-job" : ""}`} style={{ borderLeftColor: technician?.schedule_color || "#6255d9" }}>
    <summary><span>{time}</span><strong>{month ? customerName : `#${job.job_number} · ${job.title}`}</strong>{month ? <small>{job.title}</small> : <small>{customerName}</small>}{!month && <small className="schedule-assignees">{assignedTechnicians.slice(0,3).map(item=><i key={item!.id} title={item!.preferred_name}>{item!.preferred_name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()}</i>)}<span>{service?.name || "Custom work"} · {assignedTechnicians.map(item=>item?.preferred_name).join(", ") || "Unassigned"}</span></small>}{!compact && !month && <small>{location ? `${location.city}, ${location.state}` : job.service_address || "No address"} · {job.priority}</small>}</summary>
    <div className="schedule-popover"><Link href={`/app/${slug}/jobs/${job.id}`}>Open job details</Link>{canEdit ? <form action={updateScheduledJob.bind(null, slug, job.id)}>
      <input type="hidden" name="returnPath" value={returnPath}/>
      <label>Start<input required name="startsAt" type="datetime-local" defaultValue={localInput(job.starts_at, timeZone)}/></label>
      <label>Duration<input required name="durationMinutes" type="number" min="15" step="15" defaultValue={duration}/></label>
      <label>Technician<select name="technicianId" defaultValue={job.assigned_technician_id ?? ""}><option value="">Unassigned</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.preferred_name}</option>)}</select></label>
      <button className="sv-button">Save schedule</button>
    </form> : <p>Your role has read-only schedule access.</p>}</div>
  </details>;
}

export default async function SchedulePage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const today = dateInTimeZone(new Date(), business.timezone);
  const selectedDate = validDate(query.date, today);
  const view: ScheduleView = query.view === "day" || query.view === "month" ? query.view : "week";
  const days = calendarDays(selectedDate, view);
  const rangeEndDate = addDays(days.at(-1) ?? selectedDate, 1);
  const rangeStart = zonedDateTimeToUtc(days[0], "00:00", business.timezone).toISOString();
  const rangeEnd = zonedDateTimeToUtc(rangeEndDate, "00:00", business.timezone).toISOString();
  let jobsQuery = supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,ends_at,estimated_duration_minutes,assigned_technician_id,service_address,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),service_locations!jobs_service_location_tenant_fk(city,state),services!jobs_service_tenant_fk(name)")
    .eq("business_id", business.id).eq("is_deleted", false).gte("starts_at", rangeStart).lt("starts_at", rangeEnd).neq("status", "canceled");
  if (query.status && query.status !== "all") jobsQuery = jobsQuery.eq("status", query.status);
  const [{ data: jobs, error }, { data: technicians }, { data: availability }, { data: unassigned }] = await Promise.all([
    jobsQuery.order("starts_at"),
    supabase.from("technician_directory").select("id,preferred_name,schedule_color").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).order("preferred_name"),
    supabase.from("booking_availability").select("start_time,end_time").eq("business_id", business.id).eq("active", true),
    supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,ends_at,estimated_duration_minutes,assigned_technician_id,service_address,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),service_locations!jobs_service_location_tenant_fk(city,state),services!jobs_service_tenant_fk(name)")
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
  const navigationDate = (offset: -1 | 1) => view === "month" ? shiftCalendarMonth(selectedDate, offset) : addDays(selectedDate, offset * (view === "week" ? 7 : 1));
  const hrefFor = (date: string) => {
    const paramsCopy = new URLSearchParams(queryParams); paramsCopy.set("date", date);
    return `/app/${businessSlug}/schedule?${paramsCopy.toString()}`;
  };
  const canEdit = canManageCustomers(role);
  const jobRows=(jobs ?? []) as unknown as JobRow[];
  const allJobIds=[...new Set([...jobRows.map(job=>job.id),...(unassigned??[]).map(job=>job.id)])];
  const {data:assignmentRows,error:assignmentError}=allJobIds.length?await supabase.from("job_assignments").select("job_id,technician_id,assignment_role,assigned_at").eq("business_id",business.id).eq("is_active",true).in("job_id",allJobIds).order("assigned_at"):{data:[],error:null};
  if(assignmentError)console.error("Schedule assignment query failed",{code:assignmentError.code,businessId:business.id});
  const assignmentMap=new Map<string,string[]>();
  for(const assignment of assignmentRows??[]){const ids=assignmentMap.get(assignment.job_id)??[];if(assignment.assignment_role==="primary")ids.unshift(assignment.technician_id);else ids.push(assignment.technician_id);assignmentMap.set(assignment.job_id,ids);}
  const withAssignments=(job:JobRow)=>({...job,technician_ids:assignmentMap.get(job.id)??(job.assigned_technician_id?[job.assigned_technician_id]:[])});
  const filteredJobs=jobRows.map(withAssignments).filter(job=>query.technician==="unassigned"?!job.technician_ids?.length:query.technician?job.technician_ids?.includes(query.technician):true);
  const scheduleJobs = filteredJobs;
  const unassignedJobs = ((unassigned ?? []) as unknown as JobRow[]).map(withAssignments).filter(job=>!job.technician_ids?.length);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content schedule-page">
    <header className="epic3-header"><div><small>Field service operations</small><h1>Schedule</h1><p>Times are displayed in {business.timezone}.</p></div>{canEdit&&<AddJobDrawer businessSlug={businessSlug}/>}</header>
    {query.error && <div className="workspace-notice error">{query.error}</div>}{query.success && <div className="workspace-notice success">{query.success}</div>}
    {!canEdit && <div className="workspace-notice">Your {role.replaceAll("_", " ")} role can view this schedule but cannot change assignments. Ask an owner or admin to grant manager access.</div>}
    <section className="workspace-panel schedule-toolbar"><div className="schedule-toolbar-controls"><div className="schedule-navigation"><Link aria-label={`Previous ${view}`} href={hrefFor(navigationDate(-1))}>‹</Link><Link className="sv-button sv-secondary" href={hrefFor(today)}>Today</Link><Link aria-label={`Next ${view}`} href={hrefFor(navigationDate(1))}>›</Link></div><nav className="schedule-view-controls" aria-label="Schedule view">{(["day", "week", "month"] as const).map((option) => { const paramsCopy = new URLSearchParams(queryParams); paramsCopy.set("view", option); return <Link key={option} className={view === option ? "active" : ""} aria-current={view === option ? "page" : undefined} href={`/app/${businessSlug}/schedule?${paramsCopy.toString()}`}>{option[0].toUpperCase() + option.slice(1)}</Link>; })}</nav></div>
      <form><input type="hidden" name="view" value={view}/><label>Date<input key={selectedDate} name="date" type="date" defaultValue={selectedDate}/></label><label>Technician<select name="technician" defaultValue={query.technician ?? ""}><option value="">All technicians</option><option value="unassigned">Unassigned only</option>{technicians?.map((item) => <option key={item.id} value={item.id}>{item.preferred_name}</option>)}</select></label><label>Status<select name="status" defaultValue={query.status ?? "all"}><option value="all">All active statuses</option>{jobStatuses.filter((status) => status !== "canceled").map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><button className="sv-button">Apply</button></form>
    </section>
    <div className="schedule-layout"><section className="workspace-panel schedule-calendar-panel">{view === "month" ? <div className="schedule-month"><header><h2>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${selectedDate.slice(0, 7)}-01T12:00:00Z`))}</h2></header><div className="schedule-month-weekdays" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="schedule-month-grid">{days.map((day) => {
      const dayJobs = scheduleJobs.filter((job) => job.starts_at && dateInTimeZone(new Date(job.starts_at), business.timezone) === day);
      const dayHref = (() => { const paramsCopy = new URLSearchParams(queryParams); paramsCopy.set("date", day); paramsCopy.set("view", "day"); return `/app/${businessSlug}/schedule?${paramsCopy.toString()}`; })();
      return <article className={`schedule-month-day ${day === today ? "today" : ""} ${day.slice(0, 7) !== selectedDate.slice(0, 7) ? "outside-month" : ""}`} key={day}><Link className="schedule-month-date" href={dayHref} aria-label={`Show all jobs for ${day}`}>{Number(day.slice(-2))}</Link><div className="schedule-month-jobs">{dayJobs.slice(0, 2).map((job) => <ScheduleJobCard key={job.id} job={job} slug={businessSlug} timeZone={business.timezone} technicians={technicians ?? []} returnPath={returnPath} compact month canEdit={canEdit}/>)}</div>{dayJobs.length > 2 && <Link className="schedule-month-more" href={dayHref}>+{dayJobs.length - 2} more</Link>}</article>;
    })}</div></div> : <div className={`schedule-calendar ${view}`}>
      <div className="schedule-corner"/>{days.map((day) => <div className={`schedule-day-heading ${day === today ? "today" : ""}`} key={day}><strong>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${day}T12:00:00Z`))}</strong><span>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`))}</span></div>)}
      <div className="schedule-time-axis" style={{ height: calendarHeight }}>{Array.from({ length: endHour - startHour + 1 }, (_, index) => <span key={index} style={{ top: index * 60 * pixelsPerMinute }}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, startHour + index)))}</span>)}</div>
      {days.map((day) => {
        const dayJobs = scheduleJobs.filter((job) => job.starts_at && dateInTimeZone(new Date(job.starts_at), business.timezone) === day);
        return <div className="schedule-day-column" key={day} style={{ height: calendarHeight }}>
          {Array.from({ length: endHour - startHour + 1 }, (_, index) => <i key={index} style={{ top: index * 60 * pixelsPerMinute }}/>)}
          {dayJobs.map((job) => {
            const placement = calendarPlacement(job.starts_at!, job.ends_at, business.timezone, startHour, endHour);
            return <div className="schedule-positioned-job" key={job.id} style={{ top: placement.top * pixelsPerMinute, minHeight: placement.height * pixelsPerMinute }}><ScheduleJobCard job={job} slug={businessSlug} timeZone={business.timezone} technicians={technicians ?? []} returnPath={returnPath} canEdit={canEdit}/></div>;
          })}
        </div>;
      })}
    </div>}</section>
    <aside className="workspace-panel unassigned-panel"><div><span className="sv-kicker">Needs dispatch</span><h2>Unassigned jobs</h2><p>{unassignedJobs.length} jobs need a technician.</p></div><div className="unassigned-list">{unassignedJobs.length ? unassignedJobs.map((job) => <ScheduleJobCard key={job.id} job={job} slug={businessSlug} timeZone={business.timezone} technicians={technicians ?? []} returnPath={returnPath} compact canEdit={canEdit}/>) : <div className="sv-empty"><p>All active jobs are assigned.</p></div>}</div></aside></div>
  </section></main>;
}
