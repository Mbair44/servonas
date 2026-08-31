import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { deleteMetaAccessToken, readMetaAccessToken, writeMetaAccessToken, type AdPlatformConnectionState } from "./adPlatform";

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number };
};

type MetaMeResponse = { id?: string; name?: string };
type MetaAccountResponse = { data?: Array<Record<string, unknown>>; paging?: { next?: string } };

export type MetaAdsAccount = {
  id: string;
  name: string;
  accountId: string;
  businessManagerId: string | null;
  status: string | null;
};

export type MetaOauthState = {
  state: string;
  businessSlug: string;
  businessId: string;
  actorUserId: string | null;
};

const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://servonas.com").replace(/\/$/, "");
const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v22.0";
const graphBase = `https://graph.facebook.com/${graphVersion}`;
const oauthBase = `https://www.facebook.com/${graphVersion}/dialog/oauth`;
const oauthScopes = ["ads_read", "business_management"];

function credentials() {
  return {
    appId: process.env.META_APP_ID?.trim() || null,
    appSecret: process.env.META_APP_SECRET?.trim() || null,
  };
}

export function metaAdsRedirectUri() {
  return process.env.META_REDIRECT_URI?.trim() || `${appBaseUrl}/api/meta-ads/callback`;
}

export function metaAdsReadyLabel() {
  const { appId, appSecret } = credentials();
  return appId && appSecret ? "ready" : "missing_config";
}

export function createMetaAdsOauthState(businessSlug: string, businessId: string, actorUserId?: string | null): MetaOauthState {
  return { state: randomBytes(24).toString("hex"), businessSlug, businessId, actorUserId: actorUserId ?? null };
}

export function metaAdsOauthUrl(state: string) {
  const { appId } = credentials();
  if (!appId) throw new Error("Meta Ads OAuth is not configured.");
  const url = new URL(oauthBase);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", metaAdsRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", oauthScopes.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

async function metaFetch<T>(path: string, options: { accessToken?: string | null; method?: string; body?: URLSearchParams; stage: string; businessId?: string; businessSlug?: string; } ): Promise<T> {
  const url = path.startsWith("http") ? path : `${graphBase}${path}`;
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  let target = url;
  if (options.accessToken) {
    const parsed = new URL(url);
    parsed.searchParams.set("access_token", options.accessToken);
    target = parsed.toString();
  }
  if (options.body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  const response = await fetch(target, { method, headers, body: options.body?.toString() });
  const json = await response.json() as T & { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };
  if (!response.ok || (json as any).error) {
    const error = (json as any).error;
    console.error("Meta Ads request failed", {
      provider: "meta",
      stage: options.stage,
      businessId: options.businessId ?? null,
      businessSlug: options.businessSlug ?? null,
      errorCode: error?.code ?? response.status,
      errorCategory: error?.type ?? "http_error",
      message: error?.message ?? `HTTP ${response.status}`,
    });
    throw Object.assign(new Error(error?.message || `Meta request failed with HTTP ${response.status}`), {
      code: error?.code ?? response.status,
      category: error?.type ?? "http_error",
      status: response.status,
    });
  }
  return json as T;
}

export async function completeMetaAdsOauth(code: string, context: { businessId: string; businessSlug: string }) {
  const { appId, appSecret } = credentials();
  if (!appId || !appSecret) throw new Error("Meta Ads OAuth is not configured.");
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: metaAdsRedirectUri(),
    client_secret: appSecret,
    code,
  });
  const token = await metaFetch<MetaTokenResponse>("/oauth/access_token", {
    method: "POST",
    body: params,
    stage: "meta_ads_authorization_code_exchange",
    businessId: context.businessId,
    businessSlug: context.businessSlug,
  });
  if (!token.access_token) throw new Error("Meta did not return an access token.");
  const me = await metaFetch<MetaMeResponse>("/me?fields=id,name", {
    accessToken: token.access_token,
    stage: "meta_ads_identity_lookup",
    businessId: context.businessId,
    businessSlug: context.businessSlug,
  });
  return {
    accessToken: token.access_token,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
    metaUserId: me.id ?? null,
    metaUserName: me.name ?? null,
    scopesGranted: oauthScopes,
  };
}

export async function getAccessibleMetaAdAccounts(input: { accessToken?: string | null; businessId: string; businessSlug?: string | null; }) {
  const accessToken = input.accessToken ?? await readMetaAccessToken(input.businessId);
  if (!accessToken) throw new Error("Reconnect Meta Ads before refreshing accounts.");
  const accounts: MetaAdsAccount[] = [];
  let next: string | null = "/me/adaccounts?fields=id,account_id,name,account_status,business{id}&limit=100";
  while (next) {
    const response: MetaAccountResponse = await metaFetch<MetaAccountResponse>(next, {
      accessToken,
      stage: "meta_ads_account_discovery",
      businessId: input.businessId,
      businessSlug: input.businessSlug ?? undefined,
    });
    for (const row of response.data ?? []) {
      const id = String(row.id ?? "");
      const accountId = String(row.account_id ?? "").trim();
      if (!id || !accountId) continue;
      accounts.push({
        id,
        name: String(row.name ?? accountId),
        accountId,
        businessManagerId: row.business && typeof row.business === "object" ? String((row.business as any).id ?? "") || null : null,
        status: row.account_status == null ? null : String(row.account_status),
      });
    }
    next = response.paging?.next ?? null;
  }
  return accounts;
}

function metricValue(actions: unknown, actionType: string) {
  if (!Array.isArray(actions)) return 0;
  const match = actions.find((entry) => entry && typeof entry === "object" && (entry as any).action_type === actionType) as any;
  return match ? Number(match.value ?? 0) : 0;
}

export async function syncMetaAdsPerformance(input: { businessId: string; businessSlug: string; actorUserId?: string | null; forceFull?: boolean; }) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin access is unavailable.");
  const { data: connection } = await admin
    .from("business_ad_platform_connections")
    .select("id,external_account_id,external_account_name,token_expires_at,last_successful_sync_at,status")
    .eq("business_id", input.businessId)
    .eq("provider", "meta")
    .maybeSingle();
  if (!connection?.external_account_id) throw new Error("Select a Meta ad account before syncing.");
  const accessToken = await readMetaAccessToken(input.businessId);
  if (!accessToken) throw new Error("Reconnect Meta Ads before syncing.");

  const accountId = String(connection.external_account_id).startsWith("act_")
    ? String(connection.external_account_id)
    : `act_${String(connection.external_account_id)}`;
  const today = new Date();
  const defaultWindowDays = connection.last_successful_sync_at && !input.forceFull ? 7 : 30;
  const since = new Date(today.getTime() - defaultWindowDays * 86400000).toISOString().slice(0, 10);
  const until = today.toISOString().slice(0, 10);
  await admin.from("business_ad_platform_connections").update({
    status: "syncing",
    last_sync_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  await admin.from("business_ad_platform_sync_events").insert({
    business_id: input.businessId,
    provider: "meta",
    ad_platform_connection_id: connection.id,
    external_account_id: connection.external_account_id,
    stage: "sync_start",
    outcome: "started",
    metadata: { business_slug: input.businessSlug, date_from: since, date_to: until },
  });

  try {
    let rowsSynced = 0;
    let next: string | null = `/${accountId}/insights?fields=campaign_id,campaign_name,campaign_status,adset_id,adset_name,adset_status,ad_id,ad_name,ad_status,date_start,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values&level=ad&time_increment=1&limit=100&time_range[since]=${since}&time_range[until]=${until}`;
    while (next) {
      const response: MetaAccountResponse = await metaFetch<MetaAccountResponse>(next, {
        accessToken,
        stage: "meta_ads_sync_insights",
        businessId: input.businessId,
        businessSlug: input.businessSlug,
      });
      const upserts = (response.data ?? []).map((row) => ({
        business_id: input.businessId,
        provider: "meta",
        external_account_id: String(connection.external_account_id),
        report_date: String(row.date_start ?? until),
        campaign_id: row.campaign_id == null ? null : String(row.campaign_id),
        campaign_name: row.campaign_name == null ? null : String(row.campaign_name),
        campaign_status: row.campaign_status == null ? null : String(row.campaign_status),
        adset_id: row.adset_id == null ? null : String(row.adset_id),
        adset_name: row.adset_name == null ? null : String(row.adset_name),
        adset_status: row.adset_status == null ? null : String(row.adset_status),
        ad_id: row.ad_id == null ? null : String(row.ad_id),
        ad_name: row.ad_name == null ? null : String(row.ad_name),
        ad_status: row.ad_status == null ? null : String(row.ad_status),
        spend_amount: Number(row.spend ?? 0),
        currency: "USD",
        impressions: Number(row.impressions ?? 0),
        reach: Number(row.reach ?? 0),
        clicks: Number(row.clicks ?? 0),
        link_clicks: metricValue(row.actions, "link_click"),
        landing_page_views: metricValue(row.actions, "landing_page_view"),
        ctr: row.ctr == null ? null : Number(row.ctr),
        cpc_amount: row.cpc == null ? null : Number(row.cpc),
        cpm_amount: row.cpm == null ? null : Number(row.cpm),
        frequency: row.frequency == null ? null : Number(row.frequency),
        leads: metricValue(row.actions, "lead"),
        purchase_value_amount: metricValue(row.action_values, "purchase"),
        raw_actions: Array.isArray(row.actions) ? row.actions : [],
        raw_payload: row,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      if (upserts.length) {
        const { error } = await admin.from("business_ad_platform_daily_performance").upsert(upserts, {
          onConflict: "business_id,provider,external_account_id,report_date,campaign_id,adset_id,ad_id",
        });
        if (error) throw new Error(`Meta daily performance upsert failed: ${error.message}`);
      }
      rowsSynced += upserts.length;
      next = response.paging?.next ?? null;
    }

    const { count } = await admin
      .from("business_ad_platform_daily_performance")
      .select("*", { count: "exact", head: true })
      .eq("business_id", input.businessId)
      .eq("provider", "meta")
      .eq("external_account_id", String(connection.external_account_id));
    const nextStatus: AdPlatformConnectionState = rowsSynced > 0 || (count ?? 0) > 0
      ? "connected_with_data"
      : "connected_synced_no_data";
    await admin.from("business_ad_platform_connections").update({
      status: nextStatus,
      last_successful_sync_at: new Date().toISOString(),
      last_sync_attempt_at: new Date().toISOString(),
      last_sync_error: null,
      last_sync_rows: rowsSynced,
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    await admin.from("business_ad_platform_sync_events").insert({
      business_id: input.businessId,
      provider: "meta",
      ad_platform_connection_id: connection.id,
      external_account_id: connection.external_account_id,
      stage: "sync_complete",
      outcome: "succeeded",
      rows_synced: rowsSynced,
      metadata: { business_slug: input.businessSlug, status: nextStatus },
    });
    console.info("Meta Ads sync succeeded", {
      provider: "meta",
      stage: "sync_success",
      businessId: input.businessId,
      businessSlug: input.businessSlug,
      adAccountId: connection.external_account_id,
      rowsSynced,
    });
    return { rowsSynced, status: nextStatus };
  } catch (error: any) {
    const category = error?.category === "OAuthException" || error?.code === 190 ? "authorization_expired" : "sync_error";
    await admin.from("business_ad_platform_connections").update({
      status: category,
      last_sync_attempt_at: new Date().toISOString(),
      last_sync_error: error instanceof Error ? error.message : "Meta sync failed.",
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    await admin.from("business_ad_platform_sync_events").insert({
      business_id: input.businessId,
      provider: "meta",
      ad_platform_connection_id: connection.id,
      external_account_id: connection.external_account_id,
      stage: "sync_failed",
      outcome: "failed",
      error_category: category,
      error_code: error?.code == null ? null : String(error.code),
      metadata: { business_slug: input.businessSlug },
    });
    console.error("Meta Ads sync failed", {
      provider: "meta",
      stage: "sync_failure",
      businessId: input.businessId,
      businessSlug: input.businessSlug,
      adAccountId: connection.external_account_id,
      errorCategory: category,
      errorCode: error?.code ?? null,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export async function persistMetaAdsConnection(input: {
  businessId: string;
  businessSlug: string;
  actorUserId: string;
  metaUserId: string | null;
  adAccountId?: string | null;
  adAccountName?: string | null;
  businessManagerId?: string | null;
  accessToken?: string | null;
  expiresAt?: string | null;
  scopesGranted?: string[];
  status?: AdPlatformConnectionState;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin access is unavailable.");
  const now = new Date().toISOString();
  const payload = {
    business_id: input.businessId,
    provider: "meta",
    connected_by: input.actorUserId,
    external_user_id: input.metaUserId,
    external_business_manager_id: input.businessManagerId ?? null,
    external_account_id: input.adAccountId ?? null,
    external_account_name: input.adAccountName ?? null,
    token_expires_at: input.expiresAt ?? null,
    scopes_granted: input.scopesGranted ?? oauthScopes,
    status: input.status ?? "connected_never_synced",
    connected_at: now,
    updated_at: now,
  };
  const { error } = await admin.from("business_ad_platform_connections").upsert(payload, {
    onConflict: "business_id,provider",
  });
  if (error) throw new Error(`Meta Ads connection could not be saved: ${error.message}`);
  if (input.accessToken) await writeMetaAccessToken(input.businessId, input.accessToken);
}

export async function selectMetaAdsAccount(input: {
  businessId: string;
  businessSlug: string;
  actorUserId: string;
  adAccountId: string;
  adAccountName: string;
  businessManagerId?: string | null;
}) {
  await persistMetaAdsConnection({
    businessId: input.businessId,
    businessSlug: input.businessSlug,
    actorUserId: input.actorUserId,
    metaUserId: null,
    adAccountId: input.adAccountId,
    adAccountName: input.adAccountName,
    businessManagerId: input.businessManagerId ?? null,
    status: "connected_never_synced",
  });
}

export async function disconnectMetaAds(businessId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin access is unavailable.");
  await deleteMetaAccessToken(businessId);
  const { error } = await admin.from("business_ad_platform_connections").update({
    status: "not_connected",
    external_account_id: null,
    external_account_name: null,
    external_business_manager_id: null,
    token_expires_at: null,
    last_sync_error: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId).eq("provider", "meta");
  if (error) throw new Error(`Meta Ads disconnect failed: ${error.message}`);
}
