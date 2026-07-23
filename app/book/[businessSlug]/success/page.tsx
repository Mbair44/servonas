import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBusinessDateTime } from "@/lib/bookingTime";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export default async function BookingSuccess({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const { businessSlug } = await params;
  const { confirmation } = await searchParams;
  const supabase = getSupabaseAdmin();
  if (!supabase || !confirmation) notFound();

  const { data: submission } = await supabase
    .from("public_booking_submissions")
    .select("id,businesses(name,website_url),services(name),customers(first_name,last_name),jobs(job_number,status,starts_at,ends_at,service_address),booking_settings!inner(public_slug,confirmation_message,brand_color,timezone)")
    .eq("id", confirmation)
    .eq("booking_settings.public_slug", businessSlug)
    .maybeSingle();
  if (!submission) notFound();

  const business = Array.isArray(submission.businesses) ? submission.businesses[0] : submission.businesses;
  const service = Array.isArray(submission.services) ? submission.services[0] : submission.services;
  const customer = Array.isArray(submission.customers) ? submission.customers[0] : submission.customers;
  const job = Array.isArray(submission.jobs) ? submission.jobs[0] : submission.jobs;
  const settings = Array.isArray(submission.booking_settings) ? submission.booking_settings[0] : submission.booking_settings;
  if (!job || !settings) notFound();
  const status = job.status === "confirmed" ? "Confirmed" : "Pending confirmation";
  const calendarParams = new URLSearchParams({
    action: "TEMPLATE",
    text: `${service?.name ?? "Appointment"} with ${business?.name ?? "Business"}`,
    dates: `${job.starts_at.replace(/[-:]/g, "").replace(".000", "")}/${job.ends_at.replace(/[-:]/g, "").replace(".000", "")}`,
    location: job.service_address ?? "",
    details: `Servonas confirmation #${job.job_number}`,
  });

  return (
    <main className="public-booking" style={{ "--booking-brand": settings.brand_color } as React.CSSProperties}>
      <section className="public-booking-card booking-success">
        <div className="success-check" aria-hidden="true">✓</div>
        <small>Confirmation #{job.job_number}</small>
        <h1>{job.status === "confirmed" ? "You’re booked" : "Request received"}</h1>
        <p>{settings.confirmation_message}</p>
        <dl className="confirmation-details">
          <div><dt>Business</dt><dd>{business?.name}</dd></div>
          <div><dt>Service</dt><dd>{service?.name}</dd></div>
          <div><dt>Date & time</dt><dd>{formatBusinessDateTime(job.starts_at, settings.timezone)}</dd></div>
          <div><dt>Customer</dt><dd>{customer?.first_name} {customer?.last_name}</dd></div>
          <div><dt>Address</dt><dd>{job.service_address || "Not provided"}</dd></div>
          <div><dt>Status</dt><dd><span className={`confirmation-status ${job.status}`}>{status}</span></dd></div>
        </dl>
        <div className="confirmation-actions">
          <a className="booking-primary-link" href={`https://calendar.google.com/calendar/render?${calendarParams.toString()}`} target="_blank" rel="noreferrer">Add to Google Calendar</a>
          <a className="booking-secondary-link" href={`/api/public-booking/${businessSlug}/calendar?confirmation=${confirmation}`}>Add to Apple / Outlook</a>
          <Link className="booking-secondary-link" href={business?.website_url || `/book/${businessSlug}`}>Back to Website</Link>
        </div>
      </section>
    </main>
  );
}
