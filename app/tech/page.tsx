import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { addDays, dateInTimeZone } from "@/lib/bookingTime";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type TechJob = {
  id: string; job_number: number; title: string; status: string; priority: string;
  starts_at: string | null; arrival_window_start: string | null; arrival_window_end: string | null;
  service_address: string | null; business_id: string;
  customers: { first_name: string; last_name: string; company_name: string | null } | { first_name: string; last_name: string; company_name: string | null }[] | null;
  services: { name: string } | { name: string }[] | null;
  service_locations: { city: string; state: string } | { city: string; state: string }[] | null;
};
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const validDate = (value: string | undefined, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

export default async function TechnicianHome({ searchParams }: { searchParams: Promise<{ error?: string; date?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tech");
  const { data: profiles } = await supabase.from("technician_directory").select("id,business_id,preferred_name,technician_status").eq("member_user_id", user.id).eq("is_active", true).eq("is_technician", true);
  if (!profiles?.length) return <main className="tech-shell"><section className="tech-empty"><h1>No technician profile</h1><p>Your administrator must create and activate your technician profile before jobs can be assigned.</p><div className="tech-header-actions"><Link className="sv-button sv-secondary" href="/app">Back to main app</Link><form action={signOut}><button className="sv-button">Log out</button></form></div></section></main>;
  const { data: businesses } = await supabase.from("businesses").select("id,name,timezone").in("id", profiles.map((profile) => profile.business_id)).eq("is_deleted", false);
  const businessById = new Map((businesses ?? []).map((business) => [business.id, business]));
  const activeProfiles = profiles.filter((profile) => businessById.has(profile.business_id));
  if (!activeProfiles.length) return <main className="tech-shell"><section className="tech-empty"><h1>No active workspace</h1><p>Your technician profiles belong to a workspace that is no longer active.</p><div className="tech-header-actions"><Link className="sv-button sv-secondary" href="/app">Back to main app</Link><form action={signOut}><button className="sv-button">Log out</button></form></div></section></main>;
  const ids = activeProfiles.map((profile) => profile.id);
  const {data:assignments,error:assignmentError}=await supabase.from("job_assignments").select("job_id").in("technician_id",ids).eq("is_active",true);
  const assignedJobIds=[...new Set((assignments??[]).map(assignment=>assignment.job_id))];
  const { data: rows, error } = assignedJobIds.length?await supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,arrival_window_start,arrival_window_end,service_address,business_id,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),services!jobs_service_tenant_fk(name),service_locations!jobs_service_location_tenant_fk(city,state)")
    .in("id", assignedJobIds).eq("is_deleted", false).not("status", "in", '("completed","canceled","declined")').order("starts_at", { ascending: true, nullsFirst: false }):{data:[],error:null};
  if (assignmentError||error) {
    console.error("Technician home query failed", { code: assignmentError?.code??error?.code, userId: user.id });
    throw new Error("Assigned jobs could not be loaded.");
  }
  const jobs = (rows ?? []) as unknown as TechJob[];
  const businessMap = new Map(activeProfiles.map((profile) => {
    const business = businessById.get(profile.business_id);
    return [profile.business_id, { name: business?.name ?? "Business", timezone: business?.timezone ?? "America/Phoenix", displayName: profile.preferred_name }];
  }));
  const primaryTimezone = businessMap.get(activeProfiles[0].business_id)?.timezone ?? "UTC";
  const today = dateInTimeZone(new Date(), primaryTimezone);
  const date = validDate(query.date, today);
  const isSelectedDate = (job: TechJob) => job.starts_at && dateInTimeZone(new Date(job.starts_at), businessMap.get(job.business_id)?.timezone ?? "UTC") === date;
  const selectedDateJobs = jobs.filter(isSelectedDate);
  const upcomingJobs = jobs.filter((job) => job.starts_at && dateInTimeZone(new Date(job.starts_at), businessMap.get(job.business_id)?.timezone ?? "UTC") > date);
  const currentJob = date === today ? selectedDateJobs.find((job) => ["en_route", "arrived", "in_progress"].includes(job.status)) : null;
  const hrefFor = (nextDate: string) => `/tech?date=${nextDate}`;
  const JobCard = ({ job }: { job: TechJob }) => {
    const business = businessMap.get(job.business_id), customer = relation(job.customers), service = relation(job.services), location = relation(job.service_locations);
    return <Link className={`tech-job-card ${job.status}`} href={`/tech/jobs/${job.id}`}><div><span className={`job-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span><b>#{job.job_number} · {job.title}</b><strong>{customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")}</strong><small>{service?.name || "Custom work"} · {location ? `${location.city}, ${location.state}` : job.service_address || "No address"}</small></div><time>{job.starts_at ? new Intl.DateTimeFormat("en-US", { timeZone: business?.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(job.starts_at)) : "Unscheduled"}</time></Link>;
  };
  return <main className="tech-shell"><header className="tech-header"><div><span className="sv-kicker">Servonas Technician</span><h1>Hello, {activeProfiles[0].preferred_name}</h1><p>{activeProfiles.map((profile) => businessById.get(profile.business_id)?.name).filter(Boolean).join(" · ")}</p><Link className="sv-button sv-secondary" href={`/tech/route?business=${activeProfiles[0].business_id}`}>View today’s route</Link></div><div className="tech-header-actions"><Link href="/app">Back to main app</Link><form action={signOut}><button className="text-button">Log out</button></form></div></header>{query.error&&<div className="workspace-notice error">{query.error}</div>}
    {currentJob&&<section className="tech-section current"><span className="sv-kicker">Current job</span><JobCard job={currentJob}/></section>}
    <section className="tech-section"><div className="tech-section-heading"><h2>Your jobs</h2><span>{selectedDateJobs.length}</span></div><div className="dispatch-toolbar"><div><Link aria-label="Previous day" href={hrefFor(addDays(date,-1))}>‹</Link><Link className="sv-button sv-secondary" href={hrefFor(today)}>Today</Link><Link aria-label="Next day" href={hrefFor(addDays(date,1))}>›</Link></div><form><label>Date<input key={date} name="date" type="date" defaultValue={date}/></label><button className="sv-button">Go</button></form><strong>{new Intl.DateTimeFormat("en-US",{timeZone:"UTC",weekday:"long",month:"long",day:"numeric"}).format(new Date(`${date}T12:00:00Z`))}</strong></div><div className="tech-job-list">{selectedDateJobs.length?selectedDateJobs.map((job)=><JobCard key={job.id} job={job}/>):<div className="tech-empty-inline">No jobs scheduled for this day.</div>}</div></section>
    <section className="tech-section"><div className="tech-section-heading"><h2>Upcoming</h2><span>{upcomingJobs.length}</span></div><div className="tech-job-list">{upcomingJobs.length?upcomingJobs.map((job)=><JobCard key={job.id} job={job}/>):<div className="tech-empty-inline">No upcoming assigned jobs.</div>}</div></section>
  </main>;
}
