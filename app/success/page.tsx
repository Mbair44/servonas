import Link from "next/link";
import Stripe from "stripe";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {GoogleAdsBookingConversion} from "@/components/GoogleAdsBookingConversion";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ session_id?: string }> };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let session: Stripe.Checkout.Session | null = null;
  let businessName = "the business";
  let homeHref = "/";
  let bookingId:string|null=null;

  if (sessionId && stripeKey) {
    try {
      const stripe=new Stripe(stripeKey),db=getSupabaseAdmin();
      const {data:booking}=db?await db.from("bookings").select("id,business_id,businesses(name)").eq("stripe_checkout_session_id",sessionId).maybeSingle():{data:null};
      bookingId=booking?.id??null;
      const business=booking?(Array.isArray(booking.businesses)?booking.businesses[0]:booking.businesses):null;
      businessName=business?.name||businessName;
      const {data:website}=db&&booking?.business_id?await db.from("business_website_settings").select("public_slug,status,custom_domain,domain_status").eq("business_id",booking.business_id).maybeSingle():{data:null};
      if(website?.status==="published")homeHref=website.domain_status==="connected"&&website.custom_domain?`https://${website.custom_domain}`:`/sites/${encodeURIComponent(website.public_slug)}`;
      else if(db&&booking?.business_id){const {data:bookingPage}=await db.from("booking_settings").select("public_slug").eq("business_id",booking.business_id).maybeSingle();if(bookingPage?.public_slug)homeHref=`/book/${encodeURIComponent(bookingPage.public_slug)}`;}
      const {data:paymentAccount}=db&&booking?.business_id?await db.from("business_payment_accounts").select("provider_account_id").eq("business_id",booking.business_id).eq("provider","stripe").maybeSingle():{data:null};
      session = await stripe.checkout.sessions.retrieve(sessionId,{},paymentAccount?.provider_account_id?{stripeAccount:paymentAccount.provider_account_id}:undefined);
      if(booking&&session.metadata?.booking_id!==booking.id)throw new Error("Checkout Session did not match the reservation.");
    } catch (error) {
      console.error("Could not retrieve Stripe Checkout session:", error);
    }
  }

  const paid = session?.payment_status === "paid";
  const rentalDate = session?.metadata?.rental_date;
  const prettyDate = rentalDate
    ? new Date(`${rentalDate}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : null;
  const bookingNumber = session?.metadata?.booking_number;
  const depositCents = Number(session?.amount_total || 0);
  const discountCents = Number(session?.total_details?.amount_discount || 0);
  const totalCents = Number(session?.metadata?.total_cents || 0);
  const balanceCents = Math.max(0, totalCents - depositCents - discountCents);

  return (
    <main className="section alt">
      <div className="container">
        <div className="form-card" style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <span className="eyebrow">{paid ? "Payment received" : "Payment verification"}</span>
          <h2>{paid ? "Your reservation is confirmed!" : "We could not verify payment yet."}</h2>
          {bookingNumber && <p className="lead">Confirmation number: <strong>#{bookingNumber}</strong></p>}
          {prettyDate && <p className="lead">Rental date: <strong>{prettyDate}</strong></p>}
          {paid ? (
            <>
              {bookingId&&<GoogleAdsBookingConversion bookingId={bookingId} valueCents={totalCents} currency={session?.currency?.toUpperCase()??"USD"}/>} 
              <p className="lead">Non-refundable deposit paid: <strong>{money(depositCents)}</strong></p>
              {discountCents > 0 ? <p className="lead">Promotion discount: <strong>{money(discountCents)}</strong></p> : null}
              <p className="muted">Remaining balance: <strong>{money(balanceCents)}</strong>. Keep your confirmation number for your records.</p>
            </>
          ) : (
            <p className="muted">Please check your email for a Stripe receipt. Contact {businessName} if you completed payment but still see this message.</p>
          )}
          <div className="actions" style={{ justifyContent: "center" }}>
            <Link className="button" href={homeHref}>Take me home</Link>
            <Link className="button secondary" href="/book">View Calendar</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
