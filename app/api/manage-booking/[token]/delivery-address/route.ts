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
  const { data: booking } = await db.from("bookings").select("id,job_id,status,total_cents,amount_paid_cents,delivery_fee_cents,tax_cents,delivery_rule_snapshot,delivery_address,delivery_city,delivery_state,delivery_zip").eq("id", access.booking_id).eq("business_id", access.business_id).maybeSingle();
  if (!booking || !["pending_payment", "paid", "confirmed"].includes(booking.status)) return NextResponse.json({ error: "This booking can no longer be updated online." }, { status: 409 });
  const { data: invoice } = booking.job_id ? await db.from("invoices").select("id").eq("business_id", access.business_id).eq("job_id", booking.job_id).not("status", "in", "(void)").maybeSingle() : { data: null };
  if (invoice) return NextResponse.json({ error: "This booking already has an invoice. Please contact the business to change the delivery address." }, { status: 409 });
  try {
    const { destination, quote } = await resolveManagedDeliveryAddress(db, access.business_id, body);
    const oldFeeCents = Number(booking.delivery_fee_cents ?? 0), oldTaxCents = Number((booking.delivery_rule_snapshot as { taxCents?: number } | null)?.taxCents ?? 0), newFeeCents = Number(quote?.feeCents ?? 0), newTaxCents = Number(quote?.taxCents ?? 0);
    const balance = bookingBalanceAfterDeliveryChange({ totalCents: Number(booking.total_cents), amountPaidCents: booking.amount_paid_cents, oldDeliveryFeeCents: oldFeeCents, newDeliveryFeeCents: newFeeCents, oldTaxCents, newTaxCents });
    const rule = quote ? { ...quote.snapshot.rule, taxable: quote.taxable, taxCents: newTaxCents, taxRateBasisPoints: quote.snapshot.rule.taxRateBasisPoints ?? null } : null;
    const update = await db.from("bookings").update({ delivery_address: destination.streetAddress, delivery_city: destination.city, delivery_state: destination.state, delivery_zip: destination.postalCode, delivery_fee_original_cents: newFeeCents, delivery_fee_cents: newFeeCents, delivery_distance_miles: quote?.distanceMiles ?? null, delivery_pricing_method: quote?.snapshot.pricingMethod ?? null, delivery_rule_snapshot: rule, delivery_origin_snapshot: quote?.snapshot.origin ?? null, delivery_destination_snapshot: quote?.snapshot.destination ?? null, delivery_inside_service_area: quote?.insideServiceArea ?? null, delivery_calculated_at: quote?.snapshot.calculatedAt ?? new Date().toISOString(), delivery_provider: quote?.snapshot.provider ?? null, delivery_provider_metadata: quote?.snapshot.providerMetadata ?? null, tax_cents: Number(booking.tax_cents ?? 0) + newTaxCents - oldTaxCents, total_cents: balance.totalCents, balance_due_cents: balance.balanceDueCents }).eq("id", booking.id).eq("business_id", access.business_id);
    if (update.error) throw new Error("The delivery address could not be saved.");
    if (booking.job_id) {
      const { data: job } = await db.from("jobs").select("id,subtotal,tax_amount,service_location_id").eq("id", booking.job_id).eq("business_id", access.business_id).maybeSingle();
      if (job) {
        const feeDifference = (newFeeCents - oldFeeCents) / 100, taxDifference = (newTaxCents - oldTaxCents) / 100, serviceAddress = [destination.streetAddress, destination.city, destination.state, destination.postalCode].filter(Boolean).join(", ");
        await db.from("jobs").update({ service_address: serviceAddress, subtotal: Number(job.subtotal ?? 0) + feeDifference, tax_amount: Number(job.tax_amount ?? 0) + taxDifference }).eq("id", job.id).eq("business_id", access.business_id);
        if (job.service_location_id) await db.from("service_locations").update({ street_address: destination.streetAddress, unit: destination.unit || null, city: destination.city, state: destination.state, postal_code: destination.postalCode, country: destination.country }).eq("id", job.service_location_id).eq("business_id", access.business_id);
      }
    }
    await db.from("booking_change_audit").insert({ booking_id: booking.id, business_id: access.business_id, change_source: "customer", change_type: "delivery_address_updated", old_values: { address: { line1: booking.delivery_address, city: booking.delivery_city, state: booking.delivery_state, postalCode: booking.delivery_zip }, delivery_fee_cents: oldFeeCents }, new_values: { address: { line1: destination.streetAddress, line2: destination.unit, city: destination.city, state: destination.state, postalCode: destination.postalCode }, delivery_fee_cents: newFeeCents, delivery_tax_cents: newTaxCents }, resulting_total_cents: balance.totalCents, resulting_balance_due_cents: balance.balanceDueCents });
    return NextResponse.json({ ok: true, totalCents: balance.totalCents, balanceDueCents: balance.balanceDueCents, deliveryFeeCents: newFeeCents });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "The delivery address could not be saved." }, { status: 422 }); }
}
