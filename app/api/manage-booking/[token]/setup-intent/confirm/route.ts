import { NextResponse } from "next/server";
import { resolveBookingManageToken } from "@/lib/bookingManage/tokens";
import { stripeClient } from "@/lib/stripeConnect";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const valueId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id ?? null;
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveBookingManageToken(token);
  const body = await request.json().catch(() => null);
  const setupIntentId = typeof body?.setupIntentId === "string" ? body.setupIntentId : null;
  const db = getSupabaseAdmin();
  if (!access || !setupIntentId || !db) return NextResponse.json({ error: "Unable to update the payment method." }, { status: 404 });
  const { data: booking } = await db.from("bookings").select("id,business_id,stripe_customer_id,business_payment_accounts(provider_account_id,charges_enabled)").eq("id", access.booking_id).eq("business_id", access.business_id).maybeSingle();
  const account = Array.isArray(booking?.business_payment_accounts) ? booking?.business_payment_accounts[0] : booking?.business_payment_accounts;
  if (!booking || !booking.stripe_customer_id || !account?.provider_account_id || !account.charges_enabled) return NextResponse.json({ error: "Unable to update the payment method." }, { status: 409 });
  try {
    const setupIntent = await stripeClient().setupIntents.retrieve(setupIntentId, {}, { stripeAccount: account.provider_account_id });
    const paymentMethodId = valueId(setupIntent.payment_method);
    const metadata = setupIntent.metadata ?? {};
    if (setupIntent.status !== "succeeded" || !paymentMethodId || valueId(setupIntent.customer) !== booking.stripe_customer_id || metadata.booking_id !== booking.id || metadata.business_id !== booking.business_id || metadata.payment_kind !== "scheduled_payment_method_update") return NextResponse.json({ error: "Unable to update the payment method." }, { status: 409 });
    const { error } = await db.from("bookings").update({ stripe_payment_method_id: paymentMethodId }).eq("id", booking.id).eq("business_id", booking.business_id);
    if (error) throw error;
    const paymentMethod = await stripeClient().paymentMethods.retrieve(paymentMethodId, { stripeAccount: account.provider_account_id });
    return NextResponse.json({ ok: true, brand: paymentMethod.card?.brand ?? null, last4: paymentMethod.card?.last4 ?? null });
  } catch {
    return NextResponse.json({ error: "Unable to update the payment method." }, { status: 502 });
  }
}
