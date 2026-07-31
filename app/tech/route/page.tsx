import Link from "next/link";
import { redirect } from "next/navigation";
import TechnicianRouteMap from "@/components/TechnicianRouteMap";
import { dateInTimeZone } from "@/lib/bookingTime";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { transitionTechnicianJob } from "../actions";

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const nextAction: Record<string, { status: string; label: string }> = {
  arrived: { status: "in_progress", label: "Start job" },
  in_progress: { status: "completed", label: "Complete job" },
};
const miles = (meters: number | null) => meters === null ? "Drive pending" : `${(meters / 1609.344).toFixed(1)} miles`;
const minutes = (seconds: number | null) => seconds === null ? "Time pending" : `${Math.max(1, Math.round(seconds / 60))} min`;

export default async function TechnicianRoutePage({ searchParams }: { searchParams: Promise<{ business?: string; error?: string; success?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tech/route");
  let profileQuery = supabase.from("technician_directory").select("id,business_id,preferred_name").eq("member_user_id", user.id).eq("is_active", true).eq("is_technician", true);
  if (query.business) profileQuery = profileQuery.eq("business_id", query.business);
  const { data: profiles } = await profileQuery.limit(1);
  const profile = profiles?.[0];
  if (!profile) redirect("/tech?error=Technician+profile+not+found");
  const { data: business } = await supabase.from("businesses").select("name,timezone").eq("id", profile.business_id).maybeSingle();
  const timezone = business?.timezone ?? "UTC";
  const today = dateInTimeZone(new Date(), timezone);
  const { data: plan, error: planError } = await supabase.from("route_plans").select("id,version,updated_at,calculation_status").eq("business_id", profile.business_id).eq("service_date", today).maybeSingle();
  const { data: route, error: routeError } = plan ? await supabase.from("technician_routes").select("id,encoded_polyline,calculation_status,origin_label,origin_is_private,destination_label,destination_is_private,driving_distance_meters,driving_duration_seconds").eq("business_id", profile.business_id).eq("route_plan_id", plan.id).eq("technician_id", profile.id).maybeSingle() : { data: null, error: null };
  const { data: stopRows, error: stopError } = route ? await supabase.from("route_stops").select("id,job_id,sequence,planned_arrival_at,appointment_window_start,appointment_window_end,latitude,longitude,calculation_status").eq("business_id", profile.business_id).eq("technician_route_id", route.id).order("sequence") : { data: null, error: null };
  const stopIds = (stopRows ?? []).map((stop) => stop.id);
  const jobIds = (stopRows ?? []).map((stop) => stop.job_id);
  const [{ data: jobs, error: jobsError }, { data: legs }] = await Promise.all([
    jobIds.length ? supabase.from("jobs").select("id,job_number,title,description,status,starts_at,service_address,assigned_technician_id,customers!jobs_customer_tenant_fk(first_name,last_name,company_name,phone),service_locations!jobs_service_location_tenant_fk(street_address,unit,city,state,postal_code),services!jobs_service_tenant_fk(name)").eq("business_id", profile.business_id).eq("assigned_technician_id", profile.id).in("id", jobIds) : Promise.resolve({ data: [], error: null }),
    stopIds.length ? supabase.from("route_legs").select("to_route_stop_id,driving_distance_meters,driving_duration_seconds,calculation_status").eq("business_id", profile.business_id).eq("technician_route_id", route!.id).in("to_route_stop_id", stopIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (planError || routeError || stopError || jobsError) {
    console.error("Technician daily route query failed", { planCode: planError?.code, routeCode: routeError?.code, stopCode: stopError?.code, jobsCode: jobsError?.code, businessId: profile.business_id, technicianId: profile.id });
  }
  const jobById = new Map((jobs ?? []).map((job) => [job.id, job]));
  const legByStop = new Map((legs ?? []).map((leg) => [leg.to_route_stop_id, leg]));
  const stops = (stopRows ?? []).flatMap((stop) => {
    const job = jobById.get(stop.job_id);
    if (!job) return [];
    const location = relation(job.service_locations), customer = relation(job.customers), service = relation(job.services), leg = legByStop.get(stop.id);
    const address = location ? [location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", ") : job.service_address ?? "";
    return [{ ...stop, job, customer, service, address, leg }];
  });
  const activeIndex = stops.findIndex((stop) => ["en_route", "arrived", "in_progress"].includes(stop.job.status));
  const currentIndex = activeIndex >= 0 ? activeIndex : stops.findIndex((stop) => stop.job.status !== "completed");
  const current = currentIndex >= 0 ? stops[currentIndex] : null;
  const next = currentIndex >= 0 ? stops.slice(currentIndex + 1).find((stop) => stop.job.status !== "completed") ?? null : null;
  const routeQuery = `?business=${encodeURIComponent(profile.business_id)}`;
  const StopCard = ({ stop, prominent = false }: { stop: typeof stops[number]; prominent?: boolean }) => {
    const action = nextAction[stop.job.status];
    const mapsQuery = encodeURIComponent(stop.address);
    return <article className={`tech-route-stop ${stop.job.status === "completed" ? "completed" : ""} ${prominent ? "prominent" : ""}`}>
      <div className="tech-route-stop-head"><span>{stop.sequence}</span><div><small>{stop.planned_arrival_at ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(stop.planned_arrival_at)) : "ETA pending"}</small><h3>#{stop.job.job_number} · {stop.job.title}</h3></div><b className={`job-status ${stop.job.status}`}>{stop.job.status.replaceAll("_", " ")}</b></div>
      <p><strong>{stop.customer?.company_name || [stop.customer?.first_name, stop.customer?.last_name].filter(Boolean).join(" ") || "Customer"}</strong><br/>{stop.service?.name || "Custom service"}<br/>{stop.address || "No service address"}</p>
      {stop.appointment_window_start && <small>Appointment window: {new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(stop.appointment_window_start))}–{new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(stop.appointment_window_end!))}</small>}
      <div className="tech-route-metrics"><span>{miles(stop.leg?.calculation_status === "ready" ? stop.leg.driving_distance_meters : null)}</span><span>{minutes(stop.leg?.calculation_status === "ready" ? stop.leg.driving_duration_seconds : null)} from prior stop</span></div>
      <div className="tech-route-actions">{stop.customer?.phone && <a href={`tel:${stop.customer.phone}`}>Call customer</a>}<Link href={`/tech/jobs/${stop.job.id}`}>Job details</Link>{stop.address && <><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`}>Google Maps</a><a target="_blank" rel="noreferrer" href={`https://maps.apple.com/?daddr=${mapsQuery}`}>Apple Maps</a><a target="_blank" rel="noreferrer" href={`https://waze.com/ul?q=${mapsQuery}&navigate=yes`}>Waze</a></>}</div>
      {stop.job.status === "dispatched" ? <Link className="sv-button sv-full" href={`/tech/jobs/${stop.job.id}`}>Start Travel &amp; Share Location</Link> : stop.job.status === "en_route" ? <><button type="button" className="sv-button sv-full" disabled>Start job</button><p className="tech-status-help">Start Job unlocks when automatic arrival is confirmed.</p></> : action && <form action={transitionTechnicianJob.bind(null, stop.job.id)}><input type="hidden" name="status" value={action.status}/><input type="hidden" name="returnTo" value={`/tech/route${routeQuery}`}/><button className="sv-button sv-full">{action.label}</button></form>}
    </article>;
  };
  const mapStops = stops.filter((stop) => stop.latitude !== null && stop.longitude !== null).map((stop) => ({ id: stop.id, sequence: stop.sequence, latitude: Number(stop.latitude), longitude: Number(stop.longitude), title: stop.job.title, completed: stop.job.status === "completed" }));
  return <main className="tech-shell tech-route-shell"><header className="tech-detail-header"><Link href="/tech">← Technician home</Link><Link href={`/tech/route${routeQuery}`}>Refresh route</Link></header>
    {query.error && <div className="workspace-notice error">{query.error}</div>}{query.success && <div className="workspace-notice success">{query.success}</div>}
    <section className="tech-route-heading"><span className="sv-kicker">Today’s planned route</span><h1>{new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(new Date())}</h1><p>{business?.name} · {profile.preferred_name}</p>{plan && <small>Plan v{plan.version} · updated {new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(plan.updated_at))}. This is a planned route, not live GPS tracking.</small>}</section>
    {!plan || !route ? <section className="tech-empty-inline"><strong>No calculated route for today.</strong><p>Your assigned jobs remain available on the technician home screen.</p></section> : <>
      <TechnicianRouteMap apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} encodedPolyline={route.encoded_polyline} stops={mapStops}/>
      {current && <section className="tech-section current"><span className="sv-kicker">Current stop</span><StopCard stop={current} prominent/></section>}
      {next && <section className="tech-section"><span className="sv-kicker">Next stop</span><StopCard stop={next}/></section>}
      <section className="tech-section"><div className="tech-section-heading"><h2>Ordered stops</h2><span>{stops.length}</span></div><div className="tech-route-list">{stops.length ? stops.map((stop) => <StopCard key={stop.id} stop={stop}/>) : <div className="tech-empty-inline">No route stops are assigned.</div>}</div></section>
    </>}
  </main>;
}
