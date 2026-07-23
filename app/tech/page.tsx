import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { dateInTimeZone } from "@/lib/bookingTime";
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

export default async function TechnicianHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tech");
  const { data: profiles } = await supabase.from("technician_profiles").select("id,business_id,display_name,technician_status,businesses(name,timezone)").eq("member_user_id", user.id).eq("is_active", true).eq("is_technician", true);
  if (!profiles?.length) return <main className="tech-shell"><section className="tech-empty"><h1>No technician profile</h1><p>Your administrator must create and activate your technician profile before jobs can be assigned.</p><form action={signOut}><button className="sv-button">Log out</button></form></section></main>;
  const ids = profiles.map((profile) => profile.id);
  const { data: rows, error } = await supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,arrival_window_start,arrival_window_end,service_address,business_id,customers(first_name,last_name,company_name),services(name),service_locations(city,state)")
    .in("assigned_technician_id", ids).eq("is_deleted", false).not("status", "in", '("completed","canceled","declined")').order("starts_at", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("Technician home query failed", { code: error.code, userId: user.id });
    throw new Error("Assigned jobs could not be loaded.");
  }
  const jobs = (rows ?? []) as unknown as TechJob[];
  const businessMap = new Map(profiles.map((profile) => {
    const business = relation(profile.businesses);
    return [profile.business_id, { name: business?.name ?? "Business", timezone: business?.timezone ?? "America/Phoenix", displayName: profile.display_name }];
  }));
  const isToday = (job: TechJob) => job.starts_at && dateInTimeZone(new Date(job.starts_at), businessMap.get(job.business_id)?.timezone ?? "UTC") === dateInTimeZone(new Date(), businessMap.get(job.business_id)?.timezone ?? "UTC");
  const todayJobs = jobs.filter(isToday);
  const upcomingJobs = jobs.filter((job) => !isToday(job));
  const currentJob = todayJobs.find((job) => ["en_route", "arrived", "in_progress"].includes(job.status));
  const JobCard = ({ job }: { job: TechJob }) => {
    const business = businessMap.get(job.business_id), customer = relation(job.customers), service = relation(job.services), location = relation(job.service_locations);
    return <Link className={`tech-job-card ${job.status}`} href={`/tech/jobs/${job.id}`}><div><span className={`job-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span><b>#{job.job_number} · {job.title}</b><strong>{customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")}</strong><small>{service?.name || "Custom work"} · {location ? `${location.city}, ${location.state}` : job.service_address || "No address"}</small></div><time>{job.starts_at ? new Intl.DateTimeFormat("en-US", { timeZone: business?.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(job.starts_at)) : "Unscheduled"}</time></Link>;
  };
  return <main className="tech-shell"><header className="tech-header"><div><span className="sv-kicker">Servonas Technician</span><h1>Hello, {profiles[0].display_name}</h1><p>{profiles.map((profile) => relation(profile.businesses)?.name).filter(Boolean).join(" · ")}</p></div><form action={signOut}><button className="text-button">Log out</button></form></header>{query.error&&<div className="workspace-notice error">{query.error}</div>}
    {currentJob&&<section className="tech-section current"><span className="sv-kicker">Current job</span><JobCard job={currentJob}/></section>}
    <section className="tech-section"><div className="tech-section-heading"><h2>Today’s jobs</h2><span>{todayJobs.length}</span></div><div className="tech-job-list">{todayJobs.length?todayJobs.map((job)=><JobCard key={job.id} job={job}/>):<div className="tech-empty-inline">No jobs scheduled today.</div>}</div></section>
    <section className="tech-section"><div className="tech-section-heading"><h2>Upcoming</h2><span>{upcomingJobs.length}</span></div><div className="tech-job-list">{upcomingJobs.length?upcomingJobs.map((job)=><JobCard key={job.id} job={job}/>):<div className="tech-empty-inline">No upcoming assigned jobs.</div>}</div></section>
  </main>;
}
