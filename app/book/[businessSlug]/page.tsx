import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import PublicBookingForm from "@/components/PublicBookingForm";
import PartyRentalBookingClient from "@/components/PartyRentalBookingClient";
import { getInventoryCapacityUsage } from "@/lib/bookings";
import { submitPublicBooking } from "./actions";
import type {Metadata} from "next";
import {EmbeddedBookingBridge} from "@/components/EmbeddedBookingBridge";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}:{params:Promise<{businessSlug:string}>}):Promise<Metadata>{
  const {businessSlug}=await params,supabase=getSupabaseAdmin();if(!supabase)return {};
  const {data:settings}=await supabase.from("booking_settings").select("business_id,logo_path,logo_url,businesses(name)").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
  if(!settings)return {};
  const business=Array.isArray(settings.businesses)?settings.businesses[0]:settings.businesses;
  const {data:signed}=settings.logo_path?await supabase.storage.from("booking-branding").createSignedUrl(settings.logo_path,3600):{data:null};
  const logo=signed?.signedUrl??settings.logo_url??null;
  return {title:`Book Online | ${business?.name??"Business"}`,icons:logo?{icon:[{url:logo}],shortcut:logo,apple:logo}:undefined};
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ error?: string; embed?: string }>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const embedded = query.embed === "1";
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

  const { data: businessProfile } = await supabase.from("businesses").select("industry_profile").eq("id", settings.business_id).maybeSingle();
  const isPartyRental = businessProfile?.industry_profile === "party_rental";
  let rentalInventory: any[] = [];
  let rentalCapacity: Record<string, Record<string, number>> = {};
  if (isPartyRental) {
    const { data } = await supabase.from("inventory_items").select("id,name,category,description,daily_price_cents,image_url,allow_quantity,stock_quantity").eq("business_id", settings.business_id).eq("active", true).order("category").order("created_at");
    rentalInventory = data ?? [];
    const start = new Date(); start.setDate(1);
    const end = new Date(start.getFullYear(), start.getMonth() + 13, 0);
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    rentalCapacity = Object.fromEntries(await Promise.all(rentalInventory.map(async (item) => {
      const rows = await getInventoryCapacityUsage(item.id, iso(start), iso(end));
      return [item.id, Object.fromEntries(rows.map((row) => [row.rental_date, row.available_quantity]))];
    })));
  }

  return (
    <>{embedded&&<EmbeddedBookingBridge/>}<main
      className={`public-booking${embedded ? " embedded-booking" : ""}`}
      style={{ "--booking-brand": settings.brand_color } as React.CSSProperties}
    >
      <section className="public-booking-card">
        {!embedded && <header>
          {bookingLogo ? (
            <img src={bookingLogo} alt={`${businessName ?? "Business"} logo`} />
          ) : (
            <div className="booking-mark">{businessName?.slice(0, 1)}</div>
          )}
          <small>Online booking</small>
          <h1>{businessName}</h1>
          <p>{settings.welcome_message}</p>
        </header>}

        {query.error && <div className="workspace-notice error">{query.error}</div>}
        {isPartyRental ? (
          rentalInventory.length ? <PartyRentalBookingClient businessSlug={businessSlug} businessName={businessName ?? "this business"} inventory={rentalInventory} capacityByItem={rentalCapacity} standardDurationMinutes={Number(settings.rental_duration_minutes??240)} /> : <div className="booking-empty">No rental items are available for online booking yet.</div>
        ) : !services?.length ? (
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
      <footer>{embedded ? <>Powered by <b>Servonas</b></> : <>Powered by <b>Servonas</b> · <Link href={`/book/${businessSlug}/privacy`}>Privacy Policy</Link> · <Link href={`/book/${businessSlug}/terms`}>Text Messaging Terms</Link></>}</footer>
    </main></>
  );
}
