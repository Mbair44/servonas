import Link from "next/link";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ session_id?: string }> };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let session: Stripe.Checkout.Session | null = null;

  if (sessionId && stripeKey) {
    try {
      session = await new Stripe(stripeKey).checkout.sessions.retrieve(sessionId);
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
              <p className="lead">Non-refundable deposit paid: <strong>{money(depositCents)}</strong></p>
              {discountCents > 0 ? <p className="lead">Promotion discount: <strong>{money(discountCents)}</strong></p> : null}
              <p className="muted">Remaining balance: <strong>{money(balanceCents)}</strong>. Keep your confirmation number for your records.</p>
            </>
          ) : (
            <p className="muted">Please check your email for a Stripe receipt. Contact NRS Party Rentals if you completed payment but still see this message.</p>
          )}
          <div className="actions" style={{ justifyContent: "center" }}>
            <Link className="button" href="/">Return Home</Link>
            <Link className="button secondary" href="/book">View Calendar</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
