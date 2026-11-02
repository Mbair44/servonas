import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveBookingManageToken } from "@/lib/bookingManage/tokens";
import { resolveManagedDeliveryAddress, type ManagedDeliveryAddress } from "@/lib/bookingManage/deliveryAddress";
import { bookingBalanceAfterDeliveryChange } from "@/lib/financial/bookingBalance";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, access = await resolveBookingManageToken(token), db = getSupabaseAdmin();
  if (!access || !db) return NextResponse.json({ error: "Link unavailable" }, { status: 404 });
  const body = await request.json().catch(() => null) as ManagedDeliveryAddress | null;
  if (!body) return NextResponse.json({ error: "Enter the new delivery address." }, { status: 400 });
  const { data: booking } = await db.from("bookings").select("job_id,status,total_cents,amount_paid_cents,delivery_fee_cents,delivery_rule_snapshot").eq("id", access.booking_id).eq("business_id", access.business_id).maybeSingle();
  if (!booking || !["pending_payment", "paid", "confirmed"].includes(booking.status)) return NextResponse.json({ error: "This booking can no longer be updated online." }, { status: 409 });
  const { data: invoice } = booking.job_id ? await db.from("invoices").select("id").eq("business_id", access.business_id).eq("job_id", booking.job_id).not("status", "in", "(void)").maybeSingle() : { data: null };
  if (invoice) return NextResponse.json({ error: "This booking already has an invoice. Please contact the business to change the delivery address." }, { status: 409 });
  try {
    const { destination, quote } = await resolveManagedDeliveryAddress(db, access.business_id, body);
    const oldFeeCents = Number(booking.delivery_fee_cents ?? 0), oldTaxCents = Number((booking.delivery_rule_snapshot as { taxCents?: number } | null)?.taxCents ?? 0), newFeeCents = Number(quote?.feeCents ?? 0), newTaxCents = Number(quote?.taxCents ?? 0);
    const balance = bookingBalanceAfterDeliveryChange({ totalCents: Number(booking.total_cents), amountPaidCents: booking.amount_paid_cents, oldDeliveryFeeCents: oldFeeCents, newDeliveryFeeCents: newFeeCents, oldTaxCents, newTaxCents });
    return NextResponse.json({ address: { line1: destination.streetAddress, line2: destination.unit, city: destination.city, state: destination.state, postalCode: destination.postalCode, country: destination.country }, delivery: quote ? { feeCents: newFeeCents, taxCents: newTaxCents, distanceMiles: quote.distanceMiles, ruleLabel: quote.ruleLabel } : { feeCents: 0, taxCents: 0 }, oldDeliveryFeeCents: oldFeeCents, totalCents: balance.totalCents, balanceDueCents: balance.balanceDueCents, differenceCents: balance.totalCents - Number(booking.total_cents) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "We couldn't calculate delivery for that address." }, { status: 422 }); }
}
