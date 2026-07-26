import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { canSendProximityEta, type RouteEtaEvidence } from "@/lib/routing/etaNotifications";

export type RouteNotificationKind = "scheduled_arrival_window" | "route_en_route" | "route_proximity_eta";

export async function prepareRouteNotification({
  jobId, routePlanId, routeStopId, planRevision, kind, evidence,
}: {
  jobId: string; routePlanId: string; routeStopId: string; planRevision: number;
  kind: RouteNotificationKind; evidence?: RouteEtaEvidence;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, outcome: "not_configured" as const };
  const { data: job, error } = await admin.from("jobs")
    .select("business_id,status,customers!jobs_customer_tenant_fk(email,phone,preferred_contact_method)")
    .eq("id", jobId).maybeSingle();
  if (error || !job) {
    console.error("Route notification job lookup failed", { jobId, code: error?.code ?? "not_found" });
    return { ok: false, outcome: "failed" as const };
  }
  const customerValue = job.customers as unknown;
  const customer = (Array.isArray(customerValue) ? customerValue[0] : customerValue) as {
    email: string | null; phone: string | null; preferred_contact_method: string;
  } | null;
  const { data: policy, error: policyError } = await admin.from("business_routing_policies")
    .select("scheduled_window_notifications_enabled,en_route_notifications_enabled,proximity_eta_notifications_enabled")
    .eq("business_id", job.business_id).maybeSingle();
  if (policyError) {
    console.error("Route notification policy lookup failed", { businessId: job.business_id, code: policyError.code });
    return { ok: false, outcome: "failed" as const };
  }
  const enabled = kind === "scheduled_arrival_window"
    ? policy?.scheduled_window_notifications_enabled
    : kind === "route_en_route"
      ? policy?.en_route_notifications_enabled
      : policy?.proximity_eta_notifications_enabled;
  if (!enabled) return { ok: true, outcome: "disabled" as const };
  if (kind === "route_en_route" && job.status !== "en_route") return { ok: true, outcome: "ineligible" as const };
  if (kind === "route_proximity_eta" && (!evidence || !canSendProximityEta(evidence))) {
    return { ok: true, outcome: "ineligible" as const };
  }
  if (!customer || customer.preferred_contact_method === "none" || customer.preferred_contact_method === "phone") {
    return { ok: true, outcome: "preference_skipped" as const };
  }
  const channel = customer.preferred_contact_method === "sms" ? "sms" : "email";
  const recipient = channel === "sms" ? customer.phone : customer.email;
  if (!recipient) return { ok: false, outcome: "not_configured" as const };
  const eventKey = `${routePlanId}:${planRevision}:${kind}`;
  const { error: insertError } = await admin.from("job_communication_events").insert({
    job_id: jobId, route_plan_id: routePlanId, route_stop_id: routeStopId,
    channel, template_key: kind, event_key: eventKey, status: "stubbed",
    recipient_email: channel === "email" ? recipient : null,
    recipient_phone: channel === "sms" ? recipient : null,
    delivery_context: {
      source: "provider_route_estimate",
      live_location_used: false,
      confidence: evidence?.confidence ?? null,
      provider_driving_duration_seconds: evidence?.providerDrivingDurationSeconds ?? null,
    },
  });
  if (insertError?.code === "23505") return { ok: true, outcome: "duplicate" as const };
  if (insertError) {
    console.error("Route notification ledger write failed", {
      jobId, routePlanId, kind, code: insertError.code,
    });
    return { ok: false, outcome: "failed" as const };
  }
  return { ok: true, outcome: "stubbed" as const };
}
