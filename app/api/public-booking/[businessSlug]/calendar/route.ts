import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const escapeIcs = (value: string) => value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
const icsDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const confirmation = new URL(request.url).searchParams.get("confirmation");
  const supabase = getSupabaseAdmin();
  if (!supabase || !confirmation) return new Response("Not found", { status: 404 });
  const { data } = await supabase.from("public_booking_submissions")
    .select("jobs(id,title,starts_at,ends_at,service_address,job_number),businesses(name),booking_settings!inner(public_slug)")
    .eq("id", confirmation).eq("booking_settings.public_slug", businessSlug).maybeSingle();
  const job = Array.isArray(data?.jobs) ? data.jobs[0] : data?.jobs;
  const business = Array.isArray(data?.businesses) ? data.businesses[0] : data?.businesses;
  if (!job) return new Response("Not found", { status: 404 });
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Servonas//Booking//EN", "BEGIN:VEVENT",
    `UID:${job.id}@servonas.com`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(job.starts_at)}`, `DTEND:${icsDate(job.ends_at)}`,
    `SUMMARY:${escapeIcs(`${job.title} with ${business?.name ?? "Business"}`)}`,
    `LOCATION:${escapeIcs(job.service_address ?? "")}`, `DESCRIPTION:Servonas confirmation #${job.job_number}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="servonas-appointment-${job.job_number}.ics"` } });
}
