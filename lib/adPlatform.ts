import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabaseAdmin";

export type AdPlatformProvider = "google_ads" | "meta";
export type AdPlatformConnectionState =
  | "not_connected"
  | "connected_never_synced"
  | "syncing"
  | "connected_synced_no_data"
  | "connected_with_data"
  | "sync_error"
  | "authorization_expired";

export type AdPlatformStatusSummary = {
  provider: AdPlatformProvider;
  state: AdPlatformConnectionState;
  accountId: string | null;
  accountName: string | null;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncError: string | null;
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  landingPageViews: number;
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
  rowsSynced: number;
  providerLabel: string;
};

const centsFromAmount = (value: unknown) => Math.max(0, Math.round(Number(value ?? 0) * 100));
const numberOrZero = (value: unknown) => Math.max(0, Number(value ?? 0));

export function adPlatformLabel(provider: AdPlatformProvider) {
  return provider === "meta" ? "Meta Ads" : "Google Ads";
}

export function adPlatformStateCopy(state: AdPlatformConnectionState) {
  switch (state) {
    case "not_connected":
      return { title: "Connect ad spend", detail: "No ad platform connected yet." };
    case "connected_never_synced":
      return { title: "Ad account connected", detail: "Waiting for first spend sync" };
    case "syncing":
      return { title: "Syncing ad spend", detail: "A spend sync is in progress." };
    case "connected_synced_no_data":
      return { title: "$0 ad spend", detail: "No spend reported for this period" };
    case "connected_with_data":
      return { title: "Ad spend connected", detail: "Spend data is available." };
    case "sync_error":
      return { title: "Ad account needs attention", detail: "The last spend sync failed." };
    case "authorization_expired":
      return { title: "Ad account needs attention", detail: "Authorization expired. Reconnect required." };
  }
}

export async function readMetaAccessToken(businessId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin access is unavailable.");
  const { data, error } = await admin.rpc("get_ad_platform_access_token", {
    p_business_id: businessId,
    p_provider: "meta",
  });
  if (error) throw new Error(`Meta credential lookup failed: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

export async function writeMetaAccessToken(businessId: string, accessToken: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin access is unavailable.");
  const { error } = await admin.rpc("store_ad_platform_access_token", {
    p_business_id: businessId,
    p_provider: "meta",
    p_access_token: accessToken,
  });
  if (error) throw new Error(`Meta credential storage failed: ${error.message}`);
}

export async function deleteMetaAccessToken(businessId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin access is unavailable.");
  const { error } = await admin.rpc("delete_ad_platform_access_token", {
    p_business_id: businessId,
    p_provider: "meta",
  });
  if (error) throw new Error(`Meta credential deletion failed: ${error.message}`);
}

export async function loadAdPlatformStatuses(db: SupabaseClient, businessId: string, from: string, to: string) {
  const [metaConnectionResult, metaPerformanceResult, googleCampaignResult, googleConnectionResult] = await Promise.all([
    db.from("business_ad_platform_connections")
      .select("id,provider,external_account_id,external_account_name,connected_at,last_successful_sync_at,last_sync_attempt_at,last_sync_error,last_sync_rows,status")
      .eq("business_id", businessId)
      .eq("provider", "meta")
      .maybeSingle(),
    db.from("business_ad_platform_daily_performance")
      .select("spend_amount,impressions,reach,clicks,landing_page_views,ctr,cpc_amount,cpm_amount")
      .eq("business_id", businessId)
      .eq("provider", "meta")
      .gte("report_date", from.slice(0, 10))
      .lt("report_date", to.slice(0, 10)),
    db.from("business_google_ads_campaigns")
      .select("monthly_budget_estimate_cents,status")
      .eq("business_id", businessId)
      .in("status", ["published", "paused"]),
    db.from("business_google_ads_connections")
      .select("google_ads_customer_id,status,connected_at,updated_at")
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);

  const metaConnection = metaConnectionResult.data as any;
  const metaRows = (metaPerformanceResult.data ?? []) as any[];
  const metaSpendCents = metaRows.reduce((sum, row) => sum + centsFromAmount(row.spend_amount), 0);
  const metaImpressions = metaRows.reduce((sum, row) => sum + numberOrZero(row.impressions), 0);
  const metaReach = metaRows.reduce((sum, row) => sum + numberOrZero(row.reach), 0);
  const metaClicks = metaRows.reduce((sum, row) => sum + numberOrZero(row.clicks), 0);
  const metaLandingPageViews = metaRows.reduce((sum, row) => sum + numberOrZero(row.landing_page_views), 0);
  const metaState = (metaConnection?.status as AdPlatformConnectionState | null)
    ?? "not_connected";

  const metaStatus: AdPlatformStatusSummary = {
    provider: "meta",
    state: metaState,
    accountId: metaConnection?.external_account_id ?? null,
    accountName: metaConnection?.external_account_name ?? null,
    connectedAt: metaConnection?.connected_at ?? null,
    lastSuccessfulSyncAt: metaConnection?.last_successful_sync_at ?? null,
    lastSyncAttemptAt: metaConnection?.last_sync_attempt_at ?? null,
    lastSyncError: metaConnection?.last_sync_error ?? null,
    spendCents: metaSpendCents,
    impressions: metaImpressions,
    reach: metaReach,
    clicks: metaClicks,
    landingPageViews: metaLandingPageViews,
    ctr: metaImpressions > 0 ? metaClicks / metaImpressions : null,
    cpcCents: metaClicks > 0 ? Math.round(metaSpendCents / metaClicks) : null,
    cpmCents: metaImpressions > 0 ? Math.round((metaSpendCents * 1000) / metaImpressions) : null,
    rowsSynced: Number(metaConnection?.last_sync_rows ?? 0),
    providerLabel: adPlatformLabel("meta"),
  };

  const googleSpendCents = ((googleCampaignResult.data ?? []) as any[]).reduce(
    (sum, row) => sum + Math.max(0, Number(row.monthly_budget_estimate_cents ?? 0)),
    0,
  );
  const googleConnected = Boolean(googleConnectionResult.data?.status && googleConnectionResult.data?.status !== "disconnected");
  const googleStatus: AdPlatformStatusSummary = {
    provider: "google_ads",
    state: googleConnected
      ? googleSpendCents > 0
        ? "connected_with_data"
        : "connected_synced_no_data"
      : "not_connected",
    accountId: googleConnectionResult.data?.google_ads_customer_id ?? null,
    accountName: googleConnectionResult.data?.google_ads_customer_id ?? null,
    connectedAt: googleConnectionResult.data?.connected_at ?? null,
    lastSuccessfulSyncAt: googleConnectionResult.data?.updated_at ?? null,
    lastSyncAttemptAt: googleConnectionResult.data?.updated_at ?? null,
    lastSyncError: null,
    spendCents: googleSpendCents,
    impressions: 0,
    reach: 0,
    clicks: 0,
    landingPageViews: 0,
    ctr: null,
    cpcCents: null,
    cpmCents: null,
    rowsSynced: 0,
    providerLabel: adPlatformLabel("google_ads"),
  };

  return [googleStatus, metaStatus] satisfies AdPlatformStatusSummary[];
}

export function buildRoasCardModel(input: {
  statuses: AdPlatformStatusSummary[];
  attributedRevenueCents: number;
  roas: number | null;
}) {
  const connected = input.statuses.filter((status) => status.state !== "not_connected");
  const failing = connected.find((status) => status.state === "sync_error" || status.state === "authorization_expired");
  if (!connected.length) return { headline: "Connect ad spend", detail: "No ad platform connected yet.", spendCents: null };
  if (failing) return { headline: "Ad account needs attention", detail: failing.lastSyncError || adPlatformStateCopy(failing.state).detail, spendCents: null };
  if (connected.every((status) => status.state === "connected_never_synced" || status.state === "syncing")) {
    return { headline: "Ad account connected", detail: "Waiting for first spend sync", spendCents: null };
  }
  const spendCents = connected.reduce((sum, status) => sum + status.spendCents, 0);
  if (spendCents <= 0) return { headline: "$0 ad spend", detail: "No spend reported for this period", spendCents: 0 };
  return {
    headline: `$${(spendCents / 100).toFixed(2)} ad spend${input.roas != null ? ` / ${input.roas.toFixed(1)}x ROAS` : ""}`,
    detail: `Attributed revenue $${(input.attributedRevenueCents / 100).toFixed(2)}`,
    spendCents,
  };
}
