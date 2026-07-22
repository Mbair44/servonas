import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export default async function BookingSuccess({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const supabase = getSupabaseAdmin();

  if (!supabase) notFound();

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("confirmation_message, brand_color, businesses(name)")
    .ilike("public_slug", businessSlug)
    .eq("enabled", true)
    .maybeSingle();

  if (!settings) notFound();

  // Supabase types this embedded relationship as an array.
  const businessName = settings.businesses?.[0]?.name ?? "The business";

  return (
    <main
      className="public-booking"
      style={{ "--booking-brand": settings.brand_color } as React.CSSProperties}
    >
      <section className="public-booking-card booking-success">
        <div className="success-check">✓</div>
        <h1>Request received</h1>
        <p>{settings.confirmation_message}</p>
        <small>{businessName} will follow up with you shortly.</small>
        <Link href={`/book/${businessSlug}`}>Book another appointment</Link>
      </section>
    </main>
  );
}
