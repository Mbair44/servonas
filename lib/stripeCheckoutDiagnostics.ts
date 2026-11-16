import type Stripe from "stripe";

type DiagnosticUser = {
  email?: string | null;
  email_confirmed_at?: string | null;
};

type CheckoutSession = Pick<Stripe.Checkout.Session, "status" | "payment_status" | "expires_at" | "created" | "amount_total" | "payment_intent">;
type PaymentIntent = {
  status: Stripe.PaymentIntent.Status;
  last_payment_error?: { code?: string | null } | null;
};

export type StripeCheckoutDiagnostic = {
  bookingNumber: number | null;
  bookingStatus: string;
  checkoutSessionStatus: Stripe.Checkout.Session.Status | null;
  paymentStatus: Stripe.Checkout.Session.PaymentStatus | null;
  checkoutCreatedAt: string | null;
  checkoutExpiresAt: string | null;
  checkoutAmountCents: number | null;
  paymentIntentExists: boolean;
  paymentIntentStatus: Stripe.PaymentIntent.Status | null;
  paymentFailureCode: string | null;
};

export type StoredCheckoutBooking = {
  bookingNumber: number | null;
  bookingStatus: string;
  checkoutSessionId: string;
};

export const STRIPE_CHECKOUT_DIAGNOSTIC_REMOVAL_PLAN =
  "Remove this route and lib/stripeCheckoutDiagnostics.ts after the expired-checkout investigation is closed and its findings are recorded.";

export const bookingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DiagnosticEnvironment = Record<string, string | undefined>;

export function stripeCheckoutDiagnosticsEnabled(env: DiagnosticEnvironment = process.env as DiagnosticEnvironment) {
  return env.STRIPE_CHECKOUT_DIAGNOSTICS_ENABLED === "true";
}

export function canUseStripeCheckoutDiagnostics(
  user: DiagnosticUser | null | undefined,
  isPlatformAdmin: (user: DiagnosticUser | null | undefined) => boolean,
  env: DiagnosticEnvironment = process.env as DiagnosticEnvironment,
) {
  return stripeCheckoutDiagnosticsEnabled(env) && isPlatformAdmin(user);
}

function asIso(unixSeconds: number | null | undefined) {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

function paymentIntentId(paymentIntent: CheckoutSession["payment_intent"]) {
  if (typeof paymentIntent === "string") return paymentIntent;
  if (paymentIntent && typeof paymentIntent === "object") return paymentIntent.id;
  return null;
}

function expandedPaymentIntent(paymentIntent: CheckoutSession["payment_intent"]): PaymentIntent | null {
  return paymentIntent && typeof paymentIntent === "object" ? paymentIntent : null;
}

/**
 * Converts only allow-listed Stripe fields into a response safe for an
 * incident investigation. Never return or log the provider object itself.
 */
export async function inspectStoredCheckoutSession(input: {
  booking: StoredCheckoutBooking;
  connectedAccountId: string;
  retrieveSession: (sessionId: string, accountId: string) => Promise<CheckoutSession>;
  retrievePaymentIntent: (paymentIntentId: string, accountId: string) => Promise<PaymentIntent>;
}): Promise<StripeCheckoutDiagnostic> {
  const session = await input.retrieveSession(input.booking.checkoutSessionId, input.connectedAccountId);
  const id = paymentIntentId(session.payment_intent);
  const paymentIntent = expandedPaymentIntent(session.payment_intent) ?? (id
    ? await input.retrievePaymentIntent(id, input.connectedAccountId)
    : null);

  return {
    bookingNumber: input.booking.bookingNumber,
    bookingStatus: input.booking.bookingStatus,
    checkoutSessionStatus: session.status,
    paymentStatus: session.payment_status,
    checkoutCreatedAt: asIso(session.created),
    checkoutExpiresAt: asIso(session.expires_at),
    checkoutAmountCents: session.amount_total,
    paymentIntentExists: Boolean(id),
    paymentIntentStatus: paymentIntent?.status ?? null,
    paymentFailureCode: paymentIntent?.last_payment_error?.code ?? null,
  };
}

export function stripeDiagnosticErrorStatus(error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  if (statusCode === 404) return 404;
  if (statusCode === 401 || statusCode === 403) return 502;
  return 502;
}
