import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isServonasPlatformAdmin } from "@/lib/platformAccess";
import { stripeClient } from "@/lib/stripeConnect";
import {
  bookingIdPattern,
  inspectStoredCheckoutSession,
  stripeCheckoutDiagnosticsEnabled,
  stripeDiagnosticErrorStatus,
} from "@/lib/stripeCheckoutDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUESTS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();
const noStore = { "Cache-Control": "no-store" };

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function allowedByRateLimit(userId: string) {
  const now = Date.now();
  const current = attempts.get(userId);
  if (!current || current.resetAt <= now) {
    attempts.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

/**
 * Temporary incident-only endpoint. It is intentionally not linked from any
 * tenant or platform UI. Remove after the Stripe checkout investigation.
 */
export async function POST(request: Request) {
  const sessionClient = await createSupabaseServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isServonasPlatformAdmin(user)) return response({ error: "Unauthorized" }, 401);
  if (!stripeCheckoutDiagnosticsEnabled()) return response({ error: "Diagnostics are disabled" }, 404);
  if (!allowedByRateLimit(user.id)) return response({ error: "Too many diagnostic requests" }, 429);

  const body = await request.json().catch(() => null) as { bookingId?: unknown } | null;
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : "";
  if (!bookingIdPattern.test(bookingId)) return response({ error: "A valid booking ID is required" }, 400);

  const admin = getSupabaseAdmin();
  if (!admin) return response({ error: "Diagnostics are unavailable" }, 503);

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id,business_id,booking_number,status,stripe_checkout_session_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) return response({ error: "Booking lookup failed" }, 502);
  if (!booking) return response({ error: "Booking not found" }, 404);
  if (!booking.stripe_checkout_session_id) return response({ error: "Booking has no stored Checkout Session" }, 409);

  const { data: paymentAccount, error: paymentAccountError } = await admin
    .from("business_payment_accounts")
    .select("provider_account_id")
    .eq("business_id", booking.business_id)
    .eq("provider", "stripe")
    .maybeSingle();
  if (paymentAccountError) return response({ error: "Connected account lookup failed" }, 502);
  if (!paymentAccount?.provider_account_id) return response({ error: "Booking business has no connected Stripe account" }, 409);

  try {
    const stripe = stripeClient();
    const diagnostic = await inspectStoredCheckoutSession({
      booking: {
        bookingNumber: booking.booking_number,
        bookingStatus: booking.status,
        checkoutSessionId: booking.stripe_checkout_session_id,
      },
      connectedAccountId: paymentAccount.provider_account_id,
      retrieveSession: (sessionId, accountId) => stripe.checkout.sessions.retrieve(
        sessionId,
        { expand: ["payment_intent"] },
        { stripeAccount: accountId },
      ),
      retrievePaymentIntent: (paymentIntentId, accountId) => stripe.paymentIntents.retrieve(
        paymentIntentId,
        {},
        { stripeAccount: accountId },
      ),
    });
    return response({ diagnostic });
  } catch (error) {
    // Deliberately omit provider messages, IDs, and raw responses from logs and clients.
    return response({ error: "Stripe diagnostic lookup failed" }, stripeDiagnosticErrorStatus(error));
  }
}
