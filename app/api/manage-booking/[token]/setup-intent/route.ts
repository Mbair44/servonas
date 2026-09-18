import { NextResponse } from "next/server";
import { resolveBookingManageToken } from "@/lib/bookingManage/tokens";
import { ensureBookingStripeCustomer } from "@/lib/bookingManage/stripeCustomer";
import { stripeClient } from "@/lib/stripeConnect";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const payableStatuses = new Set(["pending_payment", "paid", "confirmed", "completed"]);
type Diagnostic = {
  bookingId?: string | null; businessId?: string | null; bookingStatus?: string | null;
  balancePositive?: boolean; scheduleExists?: boolean; scheduleFuture?: boolean;
  connectedAccountExists?: boolean; chargesEnabled?: boolean; bookingStripeCustomerExists?: boolean;
  customerRecoveryAttempted?: boolean; customerRecoverySucceeded?: boolean;
};
function unavailable(reason: string, message: string, status: number, details: Diagnostic) {
  // Intentionally excludes token, all Stripe identifiers, client secrets, and card data.
  console.info("Manage booking SetupIntent unavailable", {
    bookingId: details.bookingId ?? null, businessId: details.businessId ?? null,
    bookingStatus: details.bookingStatus ?? null, balancePositive: Boolean(details.balancePositive),
    scheduleExists: Boolean(details.scheduleExists), scheduleFuture: Boolean(details.scheduleFuture),
    connectedAccountExists: Boolean(details.connectedAccountExists), chargesEnabled: Boolean(details.chargesEnabled),
    bookingStripeCustomerExists: Boolean(details.bookingStripeCustomerExists),
    customerRecoveryAttempted: Boolean(details.customerRecoveryAttempted),
    customerRecoverySucceeded: Boolean(details.customerRecoverySucceeded), finalReasonCode: reason,
  });
  return NextResponse.json({ error: message, reason }, { status });
}

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveBookingManageToken(token);
  const db = getSupabaseAdmin();
  if (!access || !db) return unavailable("booking_not_payable", "This booking cannot update its scheduled payment method.", 404, {});

  const { data: booking, error: bookingError } = await db.from("bookings")
    .select("id,business_id,status,balance_due_cents,balance_charge_scheduled_for,stripe_customer_id,customer_id")
    .eq("id", access.booking_id).eq("business_id", access.business_id).maybeSingle();
  if (bookingError) {
    console.error("Manage booking SetupIntent booking lookup failed", {
      bookingId: access.booking_id, businessId: access.business_id, code: bookingError.code,
      message: bookingError.message, details: bookingError.details ?? null, hint: bookingError.hint ?? null,
    });
    return unavailable("booking_lookup_failed", "We couldn't load this booking right now. Please try again.", 503, { bookingId: access.booking_id, businessId: access.business_id });
  }
  if (!booking) return unavailable("booking_not_payable", "This booking cannot update its scheduled payment method.", 404, { bookingId: access.booking_id, businessId: access.business_id });

  const { data: account, error: accountError } = await db.from("business_payment_accounts")
    .select("provider_account_id,charges_enabled").eq("business_id", booking.business_id).eq("provider", "stripe").maybeSingle();
  if (accountError) {
    console.error("Manage booking SetupIntent payment account lookup failed", {
      bookingId: booking.id, businessId: booking.business_id, code: accountError.code,
      message: accountError.message, details: accountError.details ?? null, hint: accountError.hint ?? null,
    });
    return unavailable("stripe_account_missing", "Online payment method updates are temporarily unavailable. Please contact us.", 503, { bookingId: booking.id, businessId: booking.business_id, bookingStatus: booking.status });
  }

  const scheduledAt = booking.balance_charge_scheduled_for ? new Date(booking.balance_charge_scheduled_for).getTime() : NaN;
  const details: Diagnostic = {
    bookingId: booking.id, businessId: booking.business_id, bookingStatus: booking.status,
    balancePositive: Number(booking.balance_due_cents) > 0,
    scheduleExists: Boolean(booking.balance_charge_scheduled_for), scheduleFuture: Number.isFinite(scheduledAt) && scheduledAt > Date.now(),
    connectedAccountExists: Boolean(account?.provider_account_id), chargesEnabled: Boolean(account?.charges_enabled),
    bookingStripeCustomerExists: Boolean(booking.stripe_customer_id),
  };
  if (!details.balancePositive) return unavailable("no_balance_due", "No balance is due.", 409, details);
  if (!payableStatuses.has(booking.status)) return unavailable("booking_not_payable", "This booking cannot update its scheduled payment method.", 409, details);
  if (!details.scheduleExists) return unavailable("scheduled_charge_missing", "This booking has no scheduled payment to update.", 409, details);
  if (!details.scheduleFuture) return unavailable("scheduled_charge_already_due", "This scheduled payment can no longer be updated online.", 409, details);
  if (!account) return unavailable("stripe_account_missing", "Online payment method updates are temporarily unavailable. Please contact us.", 503, details);
  if (!account.provider_account_id || !account.charges_enabled || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return unavailable("stripe_account_not_ready", "Online payment method updates are temporarily unavailable. Please contact us.", 503, details);

  const { data: customer, error: customerError } = booking.customer_id ? await db.from("customers")
    .select("first_name,last_name,email,phone").eq("id", booking.customer_id).maybeSingle() : { data: null, error: null };
  if (customerError) console.info("Manage booking SetupIntent customer lookup unavailable", {
    bookingId: booking.id, businessId: booking.business_id, code: customerError.code, message: customerError.message,
  });
  let stripeCustomerId: string;
  try {
    details.customerRecoveryAttempted = true;
    stripeCustomerId = await ensureBookingStripeCustomer({
      bookingId: booking.id, businessId: booking.business_id, providerAccountId: account.provider_account_id,
      customerId: booking.customer_id, name: customer ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() : null,
      email: customer?.email, phone: customer?.phone, stripeCustomerId: booking.stripe_customer_id,
    });
    details.customerRecoverySucceeded = true;
  } catch {
    return unavailable("stripe_customer_recovery_failed", "We couldn't update the payment method right now. Please contact us.", 502, details);
  }

  try {
    const setupIntent = await stripeClient().setupIntents.create({
      customer: stripeCustomerId, usage: "off_session", payment_method_types: ["card"],
      metadata: { booking_id: booking.id, business_id: booking.business_id, payment_kind: "scheduled_payment_method_update" },
    }, { stripeAccount: account.provider_account_id });
    return NextResponse.json({ clientSecret: setupIntent.client_secret, connectedAccount: account.provider_account_id, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY });
  } catch {
    return unavailable("setup_intent_failed", "We couldn't update the payment method right now. Please contact us.", 502, details);
  }
}
