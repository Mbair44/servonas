import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function authorized(request: Request) {
  const expected = process.env.ADMIN_ACCESS_KEY;
  const provided = request.headers.get("x-admin-key");
  return Boolean(expected && provided && provided === expected);
}

type RefundBody = {
  bookingId?: string;
  amountCents?: number;
  reason?: string;
  cancelBooking?: boolean;
};

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabase = getSupabaseAdmin();
  if (!stripeKey || !supabase) {
    return NextResponse.json({ error: "Stripe or Supabase is not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as RefundBody;
    if (!body.bookingId) {
      return NextResponse.json({ error: "A booking is required." }, { status: 400 });
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id,status,deposit_cents,refunded_cents,stripe_payment_intent_id")
      .eq("id", body.bookingId)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (!booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: "This booking does not have a Stripe payment to refund." }, { status: 400 });
    }

    const alreadyRefunded = Number(booking.refunded_cents || 0);
    const paidDeposit = Number(booking.deposit_cents || 0);
    const refundable = Math.max(0, paidDeposit - alreadyRefunded);
    const requested = Math.round(Number(body.amountCents || refundable));

    if (!Number.isFinite(requested) || requested <= 0) {
      return NextResponse.json({ error: "Enter a refund amount greater than $0." }, { status: 400 });
    }
    if (requested > refundable) {
      return NextResponse.json({ error: "The refund cannot exceed the unrefunded deposit amount." }, { status: 400 });
    }

    const stripe = new Stripe(stripeKey);
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: requested,
      metadata: {
        booking_id: booking.id,
        admin_reason: body.reason?.trim() || "Admin refund",
      },
    });

    const newRefundedCents = alreadyRefunded + requested;
    const fullyRefunded = newRefundedCents >= paidDeposit;
    const cancelBooking = Boolean(body.cancelBooking || fullyRefunded);
    const now = new Date().toISOString();

    await supabase.from("bookings").update({
      refunded_cents: newRefundedCents,
      refunded_at: now,
      stripe_refund_id: refund.id,
      refund_reason: body.reason?.trim() || null,
      status: cancelBooking ? "refunded" : booking.status,
      cancelled_at: cancelBooking ? now : undefined,
    }).eq("id", booking.id);

    if (cancelBooking) {
      await supabase.from("booking_items").update({ status: "refunded" }).eq("booking_id", booking.id);
    }

    return NextResponse.json({
      refundId: refund.id,
      refundedCents: newRefundedCents,
      fullyRefunded,
      bookingStatus: cancelBooking ? "refunded" : booking.status,
    });
  } catch (error) {
    console.error("Refund error:", error);
    const message = error instanceof Error ? error.message : "Could not process the refund.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
