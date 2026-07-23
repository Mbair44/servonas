import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import PublicBookingForm from "@/components/PublicBookingForm";
import { submitPublicBooking } from "./actions";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("*,businesses(name,website_url)")
    .ilike("public_slug", businessSlug)
    .eq("enabled", true)
    .maybeSingle();
  if (!settings) notFound();

  const [{ data: services }, { data: hours }] = await Promise.all([
    supabase
      .from("services")
      .select("id,name,description,duration_minutes,price_amount,price_label")
      .eq("business_id", settings.business_id)
      .eq("active", true)
      .eq("is_deleted", false)
      .order("sort_order")
      .order("name"),
    supabase
      .from("booking_availability")
      .select("weekday,start_time,end_time")
      .eq("business_id", settings.business_id)
      .eq("active", true),
  ]);

  const schedule = Object.fromEntries(
    (hours ?? []).map((hour: any) => [
      hour.weekday,
      { start: hour.start_time.slice(0, 5), end: hour.end_time.slice(0, 5) },
    ]),
  );
  const businessName = Array.isArray(settings.businesses)
    ? settings.businesses[0]?.name
    : settings.businesses?.name;
  const { data: signedLogo } = settings.logo_path
    ? await supabase.storage.from("booking-branding").createSignedUrl(settings.logo_path, 3600)
    : { data: null };
  const bookingLogo = signedLogo?.signedUrl ?? settings.logo_url ?? null;

  return (
    <main
      className="public-booking"
      style={{ "--booking-brand": settings.brand_color } as React.CSSProperties}
    >
      <section className="public-booking-card">
        <header>
          {bookingLogo ? (
            <img src={bookingLogo} alt={`${businessName ?? "Business"} logo`} />
          ) : (
            <div className="booking-mark">{businessName?.slice(0, 1)}</div>
          )}
          <small>Online booking</small>
          <h1>{businessName}</h1>
          <p>{settings.welcome_message}</p>
        </header>

        {query.error && <div className="workspace-notice error">{query.error}</div>}
        {!services?.length ? (
          <div className="booking-empty">No services are available for online booking yet.</div>
        ) : (
          <PublicBookingForm
            action={submitPublicBooking.bind(null, businessSlug)}
            services={services}
            schedule={schedule}
            collectAddress={Boolean(settings.collect_address)}
            intakeQuestions={settings.intake_questions ?? []}
            businessName={businessName ?? "this business"}
            maximumDaysAhead={Number(settings.maximum_days_ahead ?? 60)}
            googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
            publicSlug={businessSlug}
            timezone={settings.timezone ?? "America/Phoenix"}
          />
        )}
      </section>
      <footer>
        Powered by <b>Servonas</b>
      </footer>
    </main>
  );
}
