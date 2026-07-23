import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBusinessDateTime } from "@/lib/bookingTime";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function databaseFailure(context: string, error: unknown): never {
  console.error(`Public booking confirmation: ${context}`, error);
  throw new Error("The booking confirmation could not be loaded.");
}

export default async function BookingSuccess({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const { businessSlug } = await params;
  const { confirmation } = await searchParams;
  if (!confirmation || !uuidPattern.test(confirmation)) notFound();

  const supabase = getSupabaseAdmin();
  if (!supabase) databaseFailure("Supabase admin client is unavailable", null);

  const { data: submission, error: submissionError } = await supabase
    .from("public_booking_submissions")
    .select("id,business_id,service_id,customer_id,job_id")
    .eq("id", confirmation)
    .maybeSingle();
  if (submissionError) databaseFailure("submission lookup failed", submissionError);
  if (!submission) notFound();

  const { data: settings, error: settingsError } = await supabase
    .from("booking_settings")
    .select("public_slug,confirmation_message,brand_color,timezone,logo_path,logo_url")
    .eq("business_id", submission.business_id)
    .maybeSingle();
  if (settingsError) databaseFailure("booking settings lookup failed", settingsError);
  if (!settings) databaseFailure("booking settings are missing for the submission business", {
    confirmation,
    businessId: submission.business_id,
  });
  if (settings.public_slug.toLowerCase() !== businessSlug.toLowerCase()) notFound();

  if (!submission.service_id || !submission.customer_id || !submission.job_id) {
    databaseFailure("submission is missing an associated record ID", {
      confirmation,
      serviceId: submission.service_id,
      customerId: submission.customer_id,
      jobId: submission.job_id,
    });
  }

  const [businessResult, serviceResult, customerResult, jobResult] = await Promise.all([
    supabase.from("businesses").select("id,name,website_url").eq("id", submission.business_id).maybeSingle(),
    supabase.from("services").select("id,name").eq("id", submission.service_id).eq("business_id", submission.business_id).maybeSingle(),
    supabase.from("customers").select("id,first_name,last_name").eq("id", submission.customer_id).eq("business_id", submission.business_id).maybeSingle(),
    supabase.from("jobs").select("id,job_number,status,starts_at,ends_at,service_address").eq("id", submission.job_id).eq("business_id", submission.business_id).maybeSingle(),
  ]);
  if (businessResult.error) databaseFailure("business lookup failed", businessResult.error);
  if (serviceResult.error) databaseFailure("service lookup failed", serviceResult.error);
  if (customerResult.error) databaseFailure("customer lookup failed", customerResult.error);
  if (jobResult.error) databaseFailure("job lookup failed", jobResult.error);
  if (!businessResult.data || !serviceResult.data || !customerResult.data || !jobResult.data) {
    databaseFailure("one or more associated booking records are missing", {
      confirmation,
      hasBusiness: Boolean(businessResult.data),
      hasService: Boolean(serviceResult.data),
      hasCustomer: Boolean(customerResult.data),
      hasJob: Boolean(jobResult.data),
    });
  }

  const business = businessResult.data;
  const service = serviceResult.data;
  const customer = customerResult.data;
  const job = jobResult.data;
  if (!job.starts_at || !job.ends_at) {
    databaseFailure("confirmed job is missing appointment times", { confirmation, jobId: job.id });
  }
  const status = job.status === "confirmed" ? "Confirmed" : "Pending confirmation";
  const { data: signedLogo } = settings.logo_path
    ? await supabase.storage.from("booking-branding").createSignedUrl(settings.logo_path, 3600)
    : { data: null };
  const bookingLogo = signedLogo?.signedUrl ?? settings.logo_url ?? null;
  const calendarParams = new URLSearchParams({
    action: "TEMPLATE",
    text: `${service.name} with ${business.name}`,
    dates: `${job.starts_at.replace(/[-:]/g, "").replace(".000", "")}/${job.ends_at.replace(/[-:]/g, "").replace(".000", "")}`,
    location: job.service_address ?? "",
    details: `Servonas confirmation #${job.job_number}`,
  });

  return (
    <main className="public-booking" style={{ "--booking-brand": settings.brand_color } as React.CSSProperties}>
      <section className="public-booking-card booking-success">
        {bookingLogo && <img className="booking-success-logo" src={bookingLogo} alt={`${business.name} logo`}/>}
        <div className="success-check" aria-hidden="true">✓</div>
        <small>Confirmation #{job.job_number}</small>
        <h1>{job.status === "confirmed" ? "You’re booked" : "Request received"}</h1>
        <p>{settings.confirmation_message}</p>
        <dl className="confirmation-details">
          <div><dt>Business</dt><dd>{business.name}</dd></div>
          <div><dt>Service</dt><dd>{service.name}</dd></div>
          <div><dt>Date & time</dt><dd>{formatBusinessDateTime(job.starts_at, settings.timezone)}</dd></div>
          <div><dt>Customer</dt><dd>{customer.first_name} {customer.last_name}</dd></div>
          <div><dt>Address</dt><dd>{job.service_address || "Not provided"}</dd></div>
          <div><dt>Status</dt><dd><span className={`confirmation-status ${job.status}`}>{status}</span></dd></div>
        </dl>
        <div className="confirmation-actions">
          <a className="booking-primary-link" href={`https://calendar.google.com/calendar/render?${calendarParams.toString()}`} target="_blank" rel="noreferrer">Add to Google Calendar</a>
          <a className="booking-secondary-link" href={`/api/public-booking/${businessSlug}/calendar?confirmation=${confirmation}`}>Add to Apple / Outlook</a>
          <Link className="booking-secondary-link" href={business.website_url || `/book/${businessSlug}`}>Back to Website</Link>
        </div>
      </section>
    </main>
  );
}
