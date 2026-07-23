import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const escapeIcs = (value: string) => value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
const icsDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const missing = () => new Response("Not found", { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const confirmation = new URL(request.url).searchParams.get("confirmation");
  const supabase = getSupabaseAdmin();
  if (!supabase || !confirmation) return missing();

  const { data: submission, error: submissionError } = await supabase
    .from("public_booking_submissions")
    .select("business_id,job_id")
    .eq("id", confirmation)
    .maybeSingle();
  if (submissionError) {
    console.error("Booking calendar submission lookup failed", submissionError);
    return new Response("Calendar could not be created", { status: 500 });
  }
  if (!submission) return missing();

  const { data: settings, error: settingsError } = await supabase
    .from("booking_settings")
    .select("public_slug")
    .eq("business_id", submission.business_id)
    .maybeSingle();
  if (settingsError) {
    console.error("Booking calendar settings lookup failed", settingsError);
    return new Response("Calendar could not be created", { status: 500 });
  }
  if (!settings || settings.public_slug.toLowerCase() !== businessSlug.toLowerCase()) return missing();

  const [jobResult, businessResult] = await Promise.all([
    supabase.from("jobs").select("id,title,starts_at,ends_at,service_address,job_number").eq("id", submission.job_id).eq("business_id", submission.business_id).maybeSingle(),
    supabase.from("businesses").select("name").eq("id", submission.business_id).maybeSingle(),
  ]);
  if (jobResult.error || businessResult.error) {
    console.error("Booking calendar associated record lookup failed", {
      jobError: jobResult.error,
      businessError: businessResult.error,
      confirmation,
    });
    return new Response("Calendar could not be created", { status: 500 });
  }
  const job = jobResult.data;
  const business = businessResult.data;
  if (!job?.starts_at || !job.ends_at || !business) {
    console.error("Booking calendar associated records are missing", { confirmation, job, business });
    return new Response("Calendar could not be created", { status: 500 });
  }

  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Servonas//Booking//EN", "BEGIN:VEVENT",
    `UID:${job.id}@servonas.com`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(job.starts_at)}`, `DTEND:${icsDate(job.ends_at)}`,
    `SUMMARY:${escapeIcs(`${job.title} with ${business.name}`)}`,
    `LOCATION:${escapeIcs(job.service_address ?? "")}`, `DESCRIPTION:Servonas confirmation #${job.job_number}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="servonas-appointment-${job.job_number}.ics"` } });
}
