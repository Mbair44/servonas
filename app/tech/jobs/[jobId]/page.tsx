import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatBusinessDateTime } from "@/lib/bookingTime";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { addTechnicianNote, removeTechnicianPhoto, transitionTechnicianJob, uploadTechnicianPhoto } from "../../actions";

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const nextAction: Record<string, { status: string; label: string }> = {
  dispatched: { status: "en_route", label: "Start travel" },
  en_route: { status: "arrived", label: "Mark arrived" },
  arrived: { status: "in_progress", label: "Start work" },
  in_progress: { status: "completed", label: "Complete job" },
};

export default async function TechnicianJobDetail({ params, searchParams }: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tech/jobs/${jobId}`)}`);
  const { data: profiles } = await supabase.from("technician_profiles").select("id").eq("member_user_id", user.id).eq("is_active", true).eq("is_technician", true);
  const ids = (profiles ?? []).map((profile) => profile.id);
  if (!ids.length) notFound();
  const { data: job, error } = await supabase.from("jobs").select("id,business_id,job_number,title,description,internal_notes,status,priority,starts_at,ends_at,arrival_window_start,arrival_window_end,service_address,assigned_technician_id,customers!jobs_customer_tenant_fk(first_name,last_name,phone),service_locations!jobs_service_location_tenant_fk(location_name,street_address,unit,city,state,postal_code,access_instructions,gate_code,parking_notes,pets_present,property_notes),services!jobs_service_tenant_fk(name),businesses(name,timezone)")
    .eq("id", jobId).in("assigned_technician_id", ids).eq("is_deleted", false).maybeSingle();
  if (error) {
    console.error("Technician job detail query failed", { code: error.code, jobId, userId: user.id });
    throw new Error("The assigned job could not be loaded.");
  }
  if (!job) notFound();
  const [{ data: history }, { data: notes }, { data: photoRows }] = await Promise.all([
    supabase.from("job_timeline_events").select("id,event_type,summary,actor_name,occurred_at").eq("job_id", jobId).eq("business_id", job.business_id).order("occurred_at", { ascending: false }),
    supabase.from("job_notes").select("id,body,note_type,author_name,created_at,updated_at").eq("job_id", jobId).eq("business_id", job.business_id).order("created_at", { ascending: false }),
    supabase.from("job_photos").select("id,storage_path,caption,photo_type,uploaded_by,created_at").eq("job_id", jobId).eq("business_id", job.business_id).order("created_at", { ascending: false }),
  ]);
  const photos = await Promise.all((photoRows ?? []).map(async (photo) => {
    const { data } = await supabase.storage.from("job-photos").createSignedUrl(photo.storage_path, 3600);
    return { ...photo, url: data?.signedUrl ?? null };
  }));
  const customer = relation(job.customers), location = relation(job.service_locations), service = relation(job.services), business = relation(job.businesses);
  const timezone = business?.timezone ?? "America/Phoenix";
  const address = location ? [location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", ") : job.service_address ?? "";
  const action = nextAction[job.status];
  return <main className="tech-shell"><header className="tech-detail-header"><Link href="/tech">← Today’s jobs</Link><span className={`job-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span></header>
    {query.error&&<div className="workspace-notice error">{query.error}</div>}{query.success&&<div className="workspace-notice success">{query.success}</div>}
    <section className="tech-hero"><small>Job #{job.job_number}</small><h1>{job.title}</h1><p>{service?.name || "Custom work"} · {job.priority} priority</p>{action?<form action={transitionTechnicianJob.bind(null,jobId)}><input type="hidden" name="status" value={action.status}/><button className="sv-button sv-full">{action.label}</button></form>:<p className="tech-status-help">{job.status==="completed"?"Work completed":job.status==="scheduled"||job.status==="confirmed"?"Waiting for office dispatch":""}</p>}</section>
    <section className="tech-section tech-detail-grid"><article><span className="sv-kicker">Appointment</span><h2>{job.starts_at?formatBusinessDateTime(job.starts_at,timezone):"Unscheduled"}</h2>{job.arrival_window_start&&<p>Arrival window: {new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"numeric",minute:"2-digit"}).format(new Date(job.arrival_window_start))}–{new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"numeric",minute:"2-digit"}).format(new Date(job.arrival_window_end!))}</p>}</article><article><span className="sv-kicker">Customer</span><h2>{customer?.first_name} {customer?.last_name}</h2>{customer?.phone&&<a className="sv-button sv-secondary" href={`tel:${customer.phone}`}>Call customer</a>}</article></section>
    <section className="tech-section"><span className="sv-kicker">Service location</span><h2>{location?.location_name || "Service address"}</h2><p>{address||"No address provided"}</p>{address&&<a className="sv-button sv-secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Open navigation</a>}<div className="tech-property-grid"><div><b>Access instructions</b><span>{location?.access_instructions||"None"}</span></div><div><b>Gate code</b><span>{location?.gate_code||"None"}</span></div><div><b>Parking</b><span>{location?.parking_notes||"None"}</span></div><div><b>Pets</b><span>{location?.pets_present?"Pets present":"No pets noted"}</span></div><div className="wide"><b>Property notes</b><span>{location?.property_notes||"None"}</span></div></div></section>
    <section className="tech-section"><span className="sv-kicker">Work details</span><h2>Description</h2><p className="tech-prewrap">{job.description||"No description provided."}</p><h2>Job notes</h2>{notes?.length?<div className="job-note-list">{notes.map((note)=><article key={note.id}><div><b>{note.note_type.replaceAll("_"," ")}</b><span>{note.author_name} · {formatBusinessDateTime(note.created_at,timezone)}{note.updated_at!==note.created_at?" · edited":""}</span></div><p className="tech-prewrap">{note.body}</p></article>)}</div>:<p>{job.internal_notes||"No notes yet."}</p>}<form className="tech-action-form" action={addTechnicianNote.bind(null,jobId)}><label>Add technician note<textarea required name="note" rows={3} maxLength={4000}/></label><button className="sv-button sv-secondary">Add note</button></form></section>
    <section className="tech-section"><span className="sv-kicker">Field documentation</span><h2>Job photos</h2><form className="tech-action-form" action={uploadTechnicianPhoto.bind(null,jobId)}><label>Photo<input required name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment"/></label><label>Type<select name="photoType" defaultValue="general"><option value="before">Before</option><option value="after">After</option><option value="general">General</option></select></label><label>Caption<input name="caption" maxLength={200}/></label><button className="sv-button sv-secondary">Upload photo</button></form>{photos.length?<div className="tech-photo-grid">{photos.map((photo)=>photo.url&&<figure key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.caption||`${photo.photo_type} job photo`}/></a><figcaption><b>{photo.photo_type}</b>{photo.caption&&<span>{photo.caption}</span>}{photo.uploaded_by===user.id&&<form action={removeTechnicianPhoto.bind(null,jobId)}><input type="hidden" name="photoId" value={photo.id}/><button className="text-button">Remove</button></form>}</figcaption></figure>)}</div>:<p>No photos yet.</p>}</section>
    <section className="tech-section"><span className="sv-kicker">Activity</span><h2>Job timeline</h2><div className="tech-timeline">{history?.length?history.map((item)=><article key={item.id}><div><b>{item.summary}</b><p>{item.actor_name}</p></div><time>{formatBusinessDateTime(item.occurred_at,timezone)}</time></article>):<p>No activity recorded yet.</p>}</div></section>
  </main>;
}
