import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBookingSms } from "@/lib/sms";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabase = getSupabaseAdmin();
  if (!stripeKey || !webhookSecret || !supabase) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error("Invalid Stripe webhook signature:", error);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const eventSession = event.data.object as Stripe.Checkout.Session;
    const bookingId = eventSession.metadata?.booking_id;
    if (bookingId && eventSession.payment_status === "paid") {
      const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
        expand: ["discounts.promotion_code", "discounts.coupon"],
      });
      const originalTotalCents = Number(session.metadata?.total_cents || 0);
      const amountPaidCents = Number(session.amount_total || 0);
      const discountCents = Number(session.total_details?.amount_discount || 0);
      const discount = session.discounts?.[0];
      const promotionCode = discount && typeof discount !== "string" && discount.promotion_code;
      const coupon = discount && typeof discount !== "string" && discount.coupon;
      const promotionCodeId =
  typeof promotionCode === "string"
    ? promotionCode
    : promotionCode && typeof promotionCode === "object"
      ? promotionCode.id
      : null;

const couponId =
  typeof coupon === "string"
    ? coupon
    : coupon && typeof coupon === "object"
      ? coupon.id
      : null;

      await supabase.from("bookings").update({
        status: "confirmed",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        deposit_cents: amountPaidCents,
        amount_paid_cents: amountPaidCents,
        discount_cents: discountCents,
        balance_due_cents: Math.max(0, originalTotalCents - amountPaidCents - discountCents),
        stripe_promotion_code_id: promotionCodeId,
        stripe_coupon_id: couponId,
        paid_at: new Date().toISOString(),
      }).eq("id", bookingId);

      await supabase.from("booking_items").update({ status: "confirmed" }).eq("booking_id", bookingId);

      try {
        const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        if (paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
          const charge = typeof paymentIntent.latest_charge === "object" ? paymentIntent.latest_charge as Stripe.Charge : null;
          if (charge?.receipt_url) await supabase.from("bookings").update({ stripe_receipt_url: charge.receipt_url }).eq("id", bookingId);
        }
        const { data: current } = await supabase.from("bookings").select("confirmation_sms_sent_at").eq("id", bookingId).single();
        if (!current?.confirmation_sms_sent_at) await sendBookingSms(bookingId, "confirmation");
      } catch (smsError) { console.error("Confirmation SMS failed:", smsError); }
    }
  }

  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.booking_id;
    if (bookingId) {
      await supabase.from("bookings").update({ status: "expired" }).eq("id", bookingId).eq("status", "pending_payment");
      await supabase.from("booking_items").update({ status: "expired" }).eq("booking_id", bookingId).eq("status", "pending_payment");
    }
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (paymentIntentId) {
      const fullyRefunded = charge.refunded;
      const update: Record<string, unknown> = {
        refunded_cents: charge.amount_refunded,
        refunded_at: new Date().toISOString(),
      };
      if (fullyRefunded) update.status = "refunded";
      await supabase.from("bookings").update(update).eq("stripe_payment_intent_id", paymentIntentId);
      if (fullyRefunded) {
        const { data: booking } = await supabase.from("bookings").select("id").eq("stripe_payment_intent_id", paymentIntentId).single();
        if (booking?.id) await supabase.from("booking_items").update({ status: "refunded" }).eq("booking_id", booking.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
