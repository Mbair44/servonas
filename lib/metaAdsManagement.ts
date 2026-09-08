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

export type MetaAdsSyncFailureCode =
  | "not_connected"
  | "account_not_selected"
  | "authorization_expired"
  | "permission_missing"
  | "meta_temporarily_unavailable"
  | "meta_api_error"
  | "database_error";

export class MetaAdsSyncError extends Error {
  constructor(
    public readonly failureCode: MetaAdsSyncFailureCode,
    message: string,
    public readonly httpStatus: number,
    public readonly operation: string,
    public readonly details: { databaseCode?: string | null; metaErrorCode?: number | null; metaErrorSubcode?: number | null; graphHttpStatus?: number | null } = {},
  ) {
    super(message);
    this.name = "MetaAdsSyncError";
  }
}

export function describeMetaAdsSyncFailure(error: unknown) {
  if (error instanceof MetaAdsSyncError) {
    return { code: error.failureCode, message: error.message, status: error.httpStatus, operation: error.operation, ...error.details };
  }
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const metaErrorCode = typeof value.metaErrorCode === "number" ? value.metaErrorCode : typeof value.code === "number" ? value.code : null;
  const metaErrorSubcode = typeof value.metaErrorSubcode === "number" ? value.metaErrorSubcode : null;
  const graphHttpStatus = typeof value.graphHttpStatus === "number" ? value.graphHttpStatus : typeof value.status === "number" ? value.status : null;
  const operation = typeof value.operation === "string" ? value.operation : "unknown";
  const rawMessage = error instanceof Error ? error.message : "";
  if (metaErrorCode === 190 || value.category === "OAuthException") {
    return { code: "authorization_expired" as const, message: "Meta authorization expired. Reconnect Meta Ads and try again.", status: 401, operation, metaErrorCode, metaErrorSubcode, graphHttpStatus };
  }
  if (metaErrorCode === 200 || /permission|access.*denied/i.test(rawMessage)) {
    return { code: "permission_missing" as const, message: "The connected Meta account is missing permission to read ad insights. Reconnect Meta Ads with the required permissions.", status: 403, operation, metaErrorCode, metaErrorSubcode, graphHttpStatus };
  }
  if (graphHttpStatus === 429 || (graphHttpStatus != null && graphHttpStatus >= 500)) {
    return { code: "meta_temporarily_unavailable" as const, message: "Meta's reporting API is temporarily unavailable. Please try syncing again shortly.", status: 503, operation, metaErrorCode, metaErrorSubcode, graphHttpStatus };
  }
  return { code: "meta_api_error" as const, message: "Meta could not complete the insights sync. Check the selected ad account and try again.", status: 502, operation, metaErrorCode, metaErrorSubcode, graphHttpStatus };
}

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

async function metaFetch<T>(path: string, options: { accessToken?: string | null; method?: string; body?: URLSearchParams; stage: string; businessId?: string; businessSlug?: string; adAccountId?: string | null; } ): Promise<T> {
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
  const json = await response.json().catch(() => ({})) as T & { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };
  if (!response.ok || (json as any).error) {
    const error = (json as any).error;
    console.error("Meta Ads request failed", {
      provider: "meta",
      stage: options.stage,
      businessId: options.businessId ?? null,
      businessSlug: options.businessSlug ?? null,
      adAccountId: options.adAccountId ?? null,
      graphHttpStatus: response.status,
      metaErrorCode: error?.code ?? null,
      metaErrorSubcode: error?.error_subcode ?? null,
      errorCategory: error?.type ?? "http_error",
      message: error?.message ?? `HTTP ${response.status}`,
    });
    throw Object.assign(new Error(error?.message || `Meta request failed with HTTP ${response.status}`), {
      code: error?.code ?? response.status,
      metaErrorCode: error?.code ?? null,
      metaErrorSubcode: error?.error_subcode ?? null,
      category: error?.type ?? "http_error",
      status: response.status,
      graphHttpStatus: response.status,
      operation: options.stage,
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
  if (!admin) throw new MetaAdsSyncError("database_error", "Meta Ads sync is temporarily unavailable.", 500, "supabase_admin_initialization");
  const connectionResult = await admin
    .from("business_ad_platform_connections")
    .select("id,external_account_id,external_account_name,token_expires_at,scopes_granted,last_successful_sync_at,status")
    .eq("business_id", input.businessId)
    .eq("provider", "meta")
    .maybeSingle();
  if (connectionResult.error) {
    console.error("Meta Ads database operation failed", { provider: "meta", stage: "connection_lookup", businessId: input.businessId, businessSlug: input.businessSlug, databaseCode: connectionResult.error.code, message: connectionResult.error.message });
    throw new MetaAdsSyncError("database_error", "Meta Ads connection information could not be loaded.", 500, "connection_lookup", { databaseCode: connectionResult.error.code });
  }
  const connection = connectionResult.data;
  if (!connection) throw new MetaAdsSyncError("not_connected", "Connect Meta Ads before syncing.", 409, "connection_lookup");
  if (!connection.external_account_id) throw new MetaAdsSyncError("account_not_selected", "Please select a Meta ad account before syncing.", 409, "account_selection");
  if (connection.token_expires_at && Date.parse(connection.token_expires_at) <= Date.now()) {
    await admin.from("business_ad_platform_connections").update({ status: "authorization_expired", last_sync_error: "Meta authorization expired.", updated_at: new Date().toISOString() }).eq("id", connection.id);
    throw new MetaAdsSyncError("authorization_expired", "Meta authorization expired. Reconnect Meta Ads and try again.", 401, "token_expiration_check");
  }
  if (Array.isArray(connection.scopes_granted) && !connection.scopes_granted.includes("ads_read")) {
    throw new MetaAdsSyncError("permission_missing", "The connected Meta account is missing permission to read ad insights. Reconnect Meta Ads with the required permissions.", 403, "scope_check");
  }
  let accessToken: string | null;
  try {
    accessToken = await readMetaAccessToken(input.businessId);
  } catch (error) {
    console.error("Meta Ads database operation failed", { provider: "meta", stage: "credential_lookup", businessId: input.businessId, businessSlug: input.businessSlug, message: error instanceof Error ? error.message : "unknown" });
    throw new MetaAdsSyncError("database_error", "The saved Meta credential could not be read.", 500, "credential_lookup");
  }
  if (!accessToken) throw new MetaAdsSyncError("authorization_expired", "Meta authorization is missing. Reconnect Meta Ads and try again.", 401, "credential_lookup");

  const accountId = String(connection.external_account_id).startsWith("act_")
    ? String(connection.external_account_id)
    : `act_${String(connection.external_account_id)}`;
  const today = new Date();
  const defaultWindowDays = connection.last_successful_sync_at && !input.forceFull ? 7 : 30;
  const since = new Date(today.getTime() - defaultWindowDays * 86400000).toISOString().slice(0, 10);
  const until = today.toISOString().slice(0, 10);
  const startUpdate = await admin.from("business_ad_platform_connections").update({
    status: "syncing",
    last_sync_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  if (startUpdate.error) {
    console.error("Meta Ads database operation failed", { provider: "meta", stage: "sync_start_update", businessId: input.businessId, businessSlug: input.businessSlug, databaseCode: startUpdate.error.code, message: startUpdate.error.message });
    throw new MetaAdsSyncError("database_error", "Meta Ads sync could not be started.", 500, "sync_start_update", { databaseCode: startUpdate.error.code });
  }
  const startEvent = await admin.from("business_ad_platform_sync_events").insert({
    business_id: input.businessId,
    provider: "meta",
    ad_platform_connection_id: connection.id,
    external_account_id: connection.external_account_id,
    stage: "sync_start",
    outcome: "started",
    metadata: { business_slug: input.businessSlug, date_from: since, date_to: until },
  });
  if (startEvent.error) console.error("Meta Ads database operation failed", { provider: "meta", stage: "sync_start_event", businessId: input.businessId, businessSlug: input.businessSlug, databaseCode: startEvent.error.code, message: startEvent.error.message });

  try {
    let rowsSynced = 0;
    let next: string | null = `/${accountId}/insights?fields=campaign_id,campaign_name,campaign_status,adset_id,adset_name,adset_status,ad_id,ad_name,ad_status,date_start,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values&level=ad&time_increment=1&limit=100&time_range[since]=${since}&time_range[until]=${until}`;
    while (next) {
      const response: MetaAccountResponse = await metaFetch<MetaAccountResponse>(next, {
        accessToken,
        stage: "meta_ads_sync_insights",
        businessId: input.businessId,
        businessSlug: input.businessSlug,
        adAccountId: connection.external_account_id,
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
        if (error) {
          console.error("Meta Ads database operation failed", { provider: "meta", stage: "performance_upsert", businessId: input.businessId, businessSlug: input.businessSlug, databaseCode: error.code, message: error.message });
          throw new MetaAdsSyncError("database_error", "Meta insights were received but could not be saved.", 500, "performance_upsert", { databaseCode: error.code });
        }
      }
      rowsSynced += upserts.length;
      next = response.paging?.next ?? null;
    }

    const { count, error: countError } = await admin
      .from("business_ad_platform_daily_performance")
      .select("*", { count: "exact", head: true })
      .eq("business_id", input.businessId)
      .eq("provider", "meta")
      .eq("external_account_id", String(connection.external_account_id));
    if (countError) {
      console.error("Meta Ads database operation failed", { provider: "meta", stage: "performance_count", businessId: input.businessId, businessSlug: input.businessSlug, databaseCode: countError.code, message: countError.message });
      throw new MetaAdsSyncError("database_error", "Meta performance totals could not be verified.", 500, "performance_count", { databaseCode: countError.code });
    }
    const nextStatus: AdPlatformConnectionState = rowsSynced > 0 || (count ?? 0) > 0
      ? "connected_with_data"
      : "connected_synced_no_data";
    const completionUpdate = await admin.from("business_ad_platform_connections").update({
      status: nextStatus,
      last_successful_sync_at: new Date().toISOString(),
      last_sync_attempt_at: new Date().toISOString(),
      last_sync_error: null,
      last_sync_rows: rowsSynced,
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    if (completionUpdate.error) {
      console.error("Meta Ads database operation failed", { provider: "meta", stage: "sync_complete_update", businessId: input.businessId, businessSlug: input.businessSlug, databaseCode: completionUpdate.error.code, message: completionUpdate.error.message });
      throw new MetaAdsSyncError("database_error", "Meta insights were saved but the sync status could not be finalized.", 500, "sync_complete_update", { databaseCode: completionUpdate.error.code });
    }
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
    const failure = describeMetaAdsSyncFailure(error);
    const category = failure.code === "authorization_expired" ? "authorization_expired" : "sync_error";
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
      errorCode: failure.metaErrorCode ?? error?.code ?? null,
      errorSubcode: failure.metaErrorSubcode ?? null,
      graphHttpStatus: failure.graphHttpStatus ?? null,
      operation: failure.operation,
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
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin access is unavailable.");
  const { data, error } = await admin.from("business_ad_platform_connections").update({
    connected_by: input.actorUserId,
    external_account_id: input.adAccountId,
    external_account_name: input.adAccountName,
    external_business_manager_id: input.businessManagerId ?? null,
    status: "connected_never_synced",
    last_sync_error: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", input.businessId).eq("provider", "meta").select("id").maybeSingle();
  if (error) {
    console.error("Meta Ads account selection save failed", {
      provider: "meta",
      stage: "account_selection_save",
      businessId: input.businessId,
      businessSlug: input.businessSlug,
      adAccountId: input.adAccountId,
      databaseCode: error.code,
      message: error.message,
    });
    throw new Error("The selected Meta ad account could not be saved.");
  }
  if (!data) throw new Error("Reconnect Meta Ads before selecting an ad account.");
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
