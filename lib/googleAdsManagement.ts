import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { recordAssistantProviderUsage } from "./assistant/usage";

type TokenResponse = { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
type GoogleAdsListResponse = { resourceNames?: string[] };
type GoogleAdsSearchStreamChunk = { results?: Record<string, unknown>[]; error?: { message?: string } };
type GoogleAdsErrorDetail = {
 errorCode?: Record<string, unknown>;
 message?: string;
 trigger?: string;
 location?: unknown;
};
type GoogleAdsErrorResponse = {
 error?: {
  code?: number;
  message?: string;
  status?: string;
  details?: GoogleAdsErrorDetail[];
 };
};

export type GoogleAdsConnectionStatus = "pending_selection" | "connected" | "reauthorization_required" | "disconnected";
export type GoogleAdsCustomer = { id: string; label: string };
export type GoogleAdsDraftInput = {
 businessId: string;
 businessName: string;
 industry: string | null;
 userId: string;
 service: { id: string; name: string; description: string | null } | null;
 rentalItem: { id: string; name: string; description: string | null } | null;
 website: { publicSlug: string | null; customDomain: string | null; status: string | null; domainStatus: string | null; heroHeading: string | null; heroSubheading: string | null; aboutText: string | null } | null;
 businessLocation: { city: string | null; state: string | null };
 serviceAreas: string[];
 geoTargetType: "service_area" | "cities" | "zip_codes" | "radius";
 geoValues: string[];
 radiusMiles: number | null;
 dailyBudgetDollars: number;
};
export type GoogleAdsDraft = {
 campaignName: string;
 adGroupName: string;
 destinationUrl: string;
 geoTargetSummary: string;
 geoTargetConfig: Record<string, unknown>;
 keywords: string[];
 negativeKeywords: string[];
 headlines: string[];
 descriptions: string[];
 aiGenerated: boolean;
};
export type GoogleAdsCampaignMetrics = {
 campaignId: string;
 impressions: number;
 clicks: number;
 ctr: number;
 averageCpcMicros: number;
 costMicros: number;
 conversions: number;
 costPerConversionMicros: number;
 status: string;
};
export type GoogleAdsSearchTerm = {
 campaignId: string;
 term: string;
 clicks: number;
 impressions: number;
 ctr: number;
 conversions: number;
 costMicros: number;
};

const supportedGoogleAdsVersions = new Set(["v23", "v24", "v25"]);
const configuredGoogleAdsVersion = process.env.GOOGLE_ADS_API_VERSION?.trim() || null;
const googleAdsVersion = configuredGoogleAdsVersion && supportedGoogleAdsVersions.has(configuredGoogleAdsVersion)
 ? configuredGoogleAdsVersion
 : "v25";
const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://servonas.com").replace(/\/$/, "");
const adsApiBase = `https://googleads.googleapis.com/${googleAdsVersion}`;
const oauthBase = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

const credentials = () => ({
 clientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() || process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim(),
 clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim(),
 developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || null,
});

const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "service";
const stripCustomerId = (value: string) => value.replace(/\D/g, "");
const uniqueStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const stableTitle = (value: string) => value.trim().replace(/\s+/g, " ");
const defaultNegativeKeywords = ["free", "cheap", "jobs", "salary", "training", "diy", "used", "wholesale"];
const maxGoogleAdsHeadlines = 15;
const maxGoogleAdsDescriptions = 4;
const normalizeKeywordText = (value: string) => value.trim().replace(/^["'[\](){}]+|["'[\](){}]+$/g, "").replace(/\s+/g, " ");
const jsonText = (value: unknown) => typeof value === "string" ? value : "";
const safeGoogleAdsLocation = (value: unknown) => {
 if (!value || typeof value !== "object") return null;
 const fieldPathElements = Array.isArray((value as { fieldPathElements?: unknown[] }).fieldPathElements)
  ? ((value as { fieldPathElements?: Array<{ fieldName?: unknown; index?: unknown }> }).fieldPathElements ?? []).map((element) => ({
   fieldName: typeof element?.fieldName === "string" ? element.fieldName : null,
   index: typeof element?.index === "number" ? element.index : null,
  }))
  : [];
 return fieldPathElements.length ? { fieldPathElements } : null;
};
const safeGoogleAdsDetails = (details: GoogleAdsErrorDetail[] | undefined) =>
 Array.isArray(details)
  ? details.map((detail) => ({
    message: detail.message ?? null,
    trigger: detail.trigger ?? null,
    errorCodeKeys: detail.errorCode ? Object.keys(detail.errorCode) : [],
    location: safeGoogleAdsLocation(detail.location),
   }))
  : [];
const safeGoogleAdsFailurePayload = (details: GoogleAdsErrorDetail[] | undefined) =>
 Array.isArray(details)
  ? details.map((detail) => ({
    message: detail.message ?? null,
    trigger: detail.trigger ?? null,
    errorCode: detail.errorCode ?? null,
    location: safeGoogleAdsLocation(detail.location),
   }))
  : [];
const limitStrings = (values: unknown[], max = 5) => values.map((value) => typeof value === "string" ? value : "").filter(Boolean).slice(0, max);
const textLengths = (values: unknown[]) => values.map((value) => typeof value === "string" ? value.length : 0);
const safeKeywordPreview = (value: unknown) => {
 if (!value || typeof value !== "object") return null;
 const keyword = (value as { text?: unknown; matchType?: unknown });
 return {
  text: typeof keyword.text === "string" ? keyword.text : null,
  length: typeof keyword.text === "string" ? keyword.text.length : 0,
  matchType: typeof keyword.matchType === "string" ? keyword.matchType : null,
 };
};
const summarizeCriterionOperation = (operation: unknown) => {
 if (!operation || typeof operation !== "object") return null;
 const create = (operation as { adGroupCriterionOperation?: { create?: { negative?: unknown; keyword?: unknown } } }).adGroupCriterionOperation?.create;
 if (!create) return null;
 return {
  negative: Boolean(create.negative),
  keyword: safeKeywordPreview(create.keyword),
 };
};
const summarizeMutateValidation = (body: unknown) => {
 if (!body || typeof body !== "object") return null;
 const operations = Array.isArray((body as { mutateOperations?: unknown[] }).mutateOperations)
  ? (body as { mutateOperations?: unknown[] }).mutateOperations ?? []
  : [];
 const campaignBudgetCreate = operations.find((operation) => typeof operation === "object" && operation && "campaignBudgetOperation" in (operation as Record<string, unknown>)) as
  | { campaignBudgetOperation?: { create?: { name?: unknown; amountMicros?: unknown; deliveryMethod?: unknown } } }
  | undefined;
 const campaignCreate = operations.find((operation) => typeof operation === "object" && operation && "campaignOperation" in (operation as Record<string, unknown>)) as
  | { campaignOperation?: { create?: { name?: unknown; advertisingChannelType?: unknown; status?: unknown; campaignBudget?: unknown; manualCpc?: unknown; networkSettings?: Record<string, unknown> } } }
  | undefined;
 const adGroupCreate = operations.find((operation) => typeof operation === "object" && operation && "adGroupOperation" in (operation as Record<string, unknown>)) as
  | { adGroupOperation?: { create?: { name?: unknown; campaign?: unknown; status?: unknown; type?: unknown } } }
  | undefined;
 const adCreate = operations.find((operation) => typeof operation === "object" && operation && "adGroupAdOperation" in (operation as Record<string, unknown>)) as
  | { adGroupAdOperation?: { create?: { adGroup?: unknown; status?: unknown; ad?: { finalUrls?: unknown[]; responsiveSearchAd?: { headlines?: Array<{ text?: unknown }>; descriptions?: Array<{ text?: unknown }> } } } } }
  | undefined;
 const criteria = operations.map(summarizeCriterionOperation).filter(Boolean) as Array<{ negative: boolean; keyword: { text: string | null; length: number; matchType: string | null } | null }>;
 const positiveKeywords = criteria.filter((item) => !item.negative);
 const negativeKeywords = criteria.filter((item) => item.negative);
 const headlineTexts = Array.isArray(adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.headlines)
  ? adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.headlines?.map((asset) => typeof asset?.text === "string" ? asset.text : "")
  : [];
 const descriptionTexts = Array.isArray(adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.descriptions)
  ? adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.descriptions?.map((asset) => typeof asset?.text === "string" ? asset.text : "")
  : [];
 return {
  campaignBudget: {
   name: typeof campaignBudgetCreate?.campaignBudgetOperation?.create?.name === "string" ? campaignBudgetCreate.campaignBudgetOperation.create.name : null,
   amountMicros: campaignBudgetCreate?.campaignBudgetOperation?.create?.amountMicros ?? null,
   deliveryMethod: typeof campaignBudgetCreate?.campaignBudgetOperation?.create?.deliveryMethod === "string" ? campaignBudgetCreate.campaignBudgetOperation.create.deliveryMethod : null,
  },
  campaign: {
   name: typeof campaignCreate?.campaignOperation?.create?.name === "string" ? campaignCreate.campaignOperation.create.name : null,
   nameLength: typeof campaignCreate?.campaignOperation?.create?.name === "string" ? campaignCreate.campaignOperation.create.name.length : 0,
   advertisingChannelType: typeof campaignCreate?.campaignOperation?.create?.advertisingChannelType === "string" ? campaignCreate.campaignOperation.create.advertisingChannelType : null,
   status: typeof campaignCreate?.campaignOperation?.create?.status === "string" ? campaignCreate.campaignOperation.create.status : null,
   campaignBudget: typeof campaignCreate?.campaignOperation?.create?.campaignBudget === "string" ? campaignCreate.campaignOperation.create.campaignBudget : null,
   hasManualCpc: Boolean(campaignCreate?.campaignOperation?.create?.manualCpc),
   networkSettings: campaignCreate?.campaignOperation?.create?.networkSettings ?? null,
  },
  adGroup: {
   name: typeof adGroupCreate?.adGroupOperation?.create?.name === "string" ? adGroupCreate.adGroupOperation.create.name : null,
   nameLength: typeof adGroupCreate?.adGroupOperation?.create?.name === "string" ? adGroupCreate.adGroupOperation.create.name.length : 0,
   campaign: typeof adGroupCreate?.adGroupOperation?.create?.campaign === "string" ? adGroupCreate.adGroupOperation.create.campaign : null,
   status: typeof adGroupCreate?.adGroupOperation?.create?.status === "string" ? adGroupCreate.adGroupOperation.create.status : null,
   type: typeof adGroupCreate?.adGroupOperation?.create?.type === "string" ? adGroupCreate.adGroupOperation.create.type : null,
  },
  keywordSummary: {
   positiveCount: positiveKeywords.length,
   negativeCount: negativeKeywords.length,
   samplePositiveKeywords: positiveKeywords.slice(0, 5).map((item) => item.keyword),
   sampleNegativeKeywords: negativeKeywords.slice(0, 5).map((item) => item.keyword),
   positiveKeywordLengths: positiveKeywords.slice(0, 5).map((item) => item.keyword?.length ?? 0),
   negativeKeywordLengths: negativeKeywords.slice(0, 5).map((item) => item.keyword?.length ?? 0),
  },
  ad: {
   finalUrls: Array.isArray(adCreate?.adGroupAdOperation?.create?.ad?.finalUrls) ? adCreate?.adGroupAdOperation?.create?.ad?.finalUrls : [],
   adGroup: typeof adCreate?.adGroupAdOperation?.create?.adGroup === "string" ? adCreate.adGroupAdOperation.create.adGroup : null,
   status: typeof adCreate?.adGroupAdOperation?.create?.status === "string" ? adCreate.adGroupAdOperation.create.status : null,
   headlineCount: headlineTexts.length,
   descriptionCount: descriptionTexts.length,
   sampleHeadlines: limitStrings(headlineTexts),
   sampleDescriptions: limitStrings(descriptionTexts),
   headlineLengths: textLengths(headlineTexts),
   descriptionLengths: textLengths(descriptionTexts),
  },
 };
};
const summarizeMutateBody = (body: unknown) => {
 if (!body || typeof body !== "object") return null;
 const source = body as {
  mutateOperations?: unknown[];
 };
 const operations = Array.isArray(source.mutateOperations) ? source.mutateOperations : [];
 const operationTypes = operations.map((operation) => {
  if (!operation || typeof operation !== "object") return "unknown";
  return Object.keys(operation as Record<string, unknown>)[0] ?? "unknown";
 });
 const adCreate = operations.find((operation) => typeof operation === "object" && operation && "adGroupAdOperation" in (operation as Record<string, unknown>)) as
  | { adGroupAdOperation?: { create?: { ad?: { finalUrls?: unknown[]; responsiveSearchAd?: { headlines?: unknown[]; descriptions?: unknown[] } } } } }
  | undefined;
 const budgetCreate = operations.find((operation) => typeof operation === "object" && operation && "campaignBudgetOperation" in (operation as Record<string, unknown>)) as
  | { campaignBudgetOperation?: { create?: { amountMicros?: unknown } } }
  | undefined;
 return {
  operationTypes,
  operationCount: operations.length,
  finalUrls: Array.isArray(adCreate?.adGroupAdOperation?.create?.ad?.finalUrls) ? adCreate?.adGroupAdOperation?.create?.ad?.finalUrls : [],
  headlineCount: Array.isArray(adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.headlines) ? adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.headlines?.length : 0,
  descriptionCount: Array.isArray(adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.descriptions) ? adCreate?.adGroupAdOperation?.create?.ad?.responsiveSearchAd?.descriptions?.length : 0,
  budgetMicros: budgetCreate?.campaignBudgetOperation?.create?.amountMicros ?? null,
  validation: summarizeMutateValidation(body),
 };
};
const logGoogleAdsDiagnostic = (message: string, payload: Record<string, unknown>) => {
 console.info(message, payload);
};
const logGoogleAdsErrorDiagnostic = (message: string, payload: Record<string, unknown>) => {
 console.error(message, payload);
};
const stableJson = (value: unknown) => {
 try {
  return JSON.stringify(value);
 } catch {
  return null;
 }
};
const now = () => Date.now();
const durationMs = (startedAt: number) => Math.max(0, Date.now() - startedAt);

class GoogleAdsRequestError extends Error {
 status: number;
 googleStatus: string | null;
 details: GoogleAdsErrorDetail[];
 loginCustomerId: string | null;
 targetCustomerId: string | null;

 constructor(input: {
  message: string;
  status: number;
  googleStatus?: string | null;
  details?: GoogleAdsErrorDetail[];
  loginCustomerId?: string | null;
  targetCustomerId?: string | null;
 }) {
  super(input.message);
  this.name = "GoogleAdsRequestError";
  this.status = input.status;
  this.googleStatus = input.googleStatus ?? null;
  this.details = input.details ?? [];
  this.loginCustomerId = input.loginCustomerId ?? null;
  this.targetCustomerId = input.targetCustomerId ?? null;
 }
}
const limitGoogleAdsTextAssets = (values: string[], max: number) => uniqueStrings(values).slice(0, max);
const normalizeGoogleAdsKeywords = (values: string[]) =>
 uniqueStrings(values.map(normalizeKeywordText).filter(Boolean));

function safeNumber(value: unknown) {
 const numeric = Number(value);
 return Number.isFinite(numeric) ? numeric : 0;
}

function oauthConfigured() {
 const { clientId, clientSecret, developerToken } = credentials();
 return Boolean(clientId && clientSecret && developerToken);
}

export const googleAdsRedirectUri = () => `${appBaseUrl}/api/google-ads/callback`;

async function tokenRequest(params: URLSearchParams, context: { stage: string; businessId?: string | null; businessSlug?: string | null; codePresent?: boolean } = { stage: "google_ads_oauth_token_request" }) {
 const redirectUri = params.get("redirect_uri") || null;
 const startedAt = now();
 logGoogleAdsDiagnostic("Google Ads OAuth request started", {
  stage: context.stage,
  provider: "google_oauth",
  endpointHost: "oauth2.googleapis.com",
  endpointPath: "/token",
  businessId: context.businessId ?? null,
  businessSlug: context.businessSlug ?? null,
  hasAuthorizationCode: Boolean(context.codePresent),
  hasRedirectUri: Boolean(redirectUri),
  redirectUri,
  googleClientIdConfigured: Boolean(credentials().clientId),
  googleClientSecretConfigured: Boolean(credentials().clientSecret),
  googleAdsDeveloperTokenConfigured: Boolean(credentials().developerToken),
  grantType: params.get("grant_type") || null,
 });
 const response = await fetch(tokenEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params,
  cache: "no-store",
 });
 const result = await response.json() as TokenResponse;
 if (!response.ok || !result.access_token) {
  logGoogleAdsErrorDiagnostic("Google Ads OAuth request failed", {
   stage: context.stage,
   provider: "google_oauth",
   endpointHost: "oauth2.googleapis.com",
   endpointPath: "/token",
   businessId: context.businessId ?? null,
   businessSlug: context.businessSlug ?? null,
   httpStatus: response.status,
   durationMs: durationMs(startedAt),
   googleError: result.error ?? null,
   googleErrorDescription: result.error_description ?? null,
   hasAuthorizationCode: Boolean(context.codePresent),
   hasRedirectUri: Boolean(redirectUri),
   redirectUri,
   googleClientIdConfigured: Boolean(credentials().clientId),
   googleClientSecretConfigured: Boolean(credentials().clientSecret),
   googleAdsDeveloperTokenConfigured: Boolean(credentials().developerToken),
   refreshTokenReturned: Boolean(result.refresh_token),
   accessTokenReturned: Boolean(result.access_token),
   responseBody: {
    error: result.error ?? null,
    error_description: result.error_description ?? null,
    access_token_returned: Boolean(result.access_token),
    refresh_token_returned: Boolean(result.refresh_token),
   },
  });
  throw new Error(result.error_description || result.error || "Google Ads authorization failed.");
 }
 logGoogleAdsDiagnostic("Google Ads OAuth request completed", {
  stage: context.stage,
  provider: "google_oauth",
  endpointHost: "oauth2.googleapis.com",
  endpointPath: "/token",
  businessId: context.businessId ?? null,
  businessSlug: context.businessSlug ?? null,
  httpStatus: response.status,
  durationMs: durationMs(startedAt),
  hasAuthorizationCode: Boolean(context.codePresent),
  hasRedirectUri: Boolean(redirectUri),
  redirectUri,
  refreshTokenReturned: Boolean(result.refresh_token),
  accessTokenReturned: Boolean(result.access_token),
 });
 return result;
}

async function refreshGoogleAdsAccessToken(refreshToken: string, context: { businessId?: string | null; businessSlug?: string | null } = {}) {
 const { clientId, clientSecret } = credentials();
 if (!clientId || !clientSecret) throw new Error("Google Ads OAuth is not configured.");
 return (await tokenRequest(new URLSearchParams({
  refresh_token: refreshToken,
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: "refresh_token",
 }), {
  stage: "google_ads_refresh_token_exchange",
  businessId: context.businessId ?? null,
  businessSlug: context.businessSlug ?? null,
  codePresent: false,
 })).access_token!;
}

type GoogleAdsRequestInput = {
 accessToken: string;
 method?: string;
 customerId?: string | null;
 loginCustomerId?: string | null;
 body?: unknown;
};
type GoogleAdsMutateOperation = Record<string, unknown>;

function googleAdsPermissionDenied(message: string, status: number) {
 return status === 403 || /permission/i.test(message) || /authorization/i.test(message);
}

function mutateOperationType(operation: unknown) {
 if (!operation || typeof operation !== "object") return "unknown";
 return Object.keys(operation as Record<string, unknown>)[0] ?? "unknown";
}

function mutateDiagnosticPhases(body: unknown) {
 const operations = Array.isArray((body as { mutateOperations?: unknown[] } | null | undefined)?.mutateOperations)
  ? ((body as { mutateOperations?: unknown[] }).mutateOperations ?? []) as GoogleAdsMutateOperation[]
  : [];
 const campaignBudgetOperation = operations.filter((operation) => mutateOperationType(operation) === "campaignBudgetOperation");
 const campaignOperation = operations.filter((operation) => mutateOperationType(operation) === "campaignOperation");
 const adGroupOperation = operations.filter((operation) => mutateOperationType(operation) === "adGroupOperation");
 const adGroupCriterionOperations = operations.filter((operation) => mutateOperationType(operation) === "adGroupCriterionOperation");
 const adGroupAdOperation = operations.filter((operation) => mutateOperationType(operation) === "adGroupAdOperation");
 const positiveKeywordOperations = adGroupCriterionOperations.filter((operation) => !(operation as { adGroupCriterionOperation?: { create?: { negative?: unknown } } }).adGroupCriterionOperation?.create?.negative);
 const negativeKeywordOperations = adGroupCriterionOperations.filter((operation) => Boolean((operation as { adGroupCriterionOperation?: { create?: { negative?: unknown } } }).adGroupCriterionOperation?.create?.negative));
 return [
  { name: "campaign_setup", operations: [...campaignBudgetOperation, ...campaignOperation] },
  { name: "ad_group_setup", operations: [...campaignBudgetOperation, ...campaignOperation, ...adGroupOperation] },
  { name: "keywords_only", operations: [...campaignBudgetOperation, ...campaignOperation, ...adGroupOperation, ...positiveKeywordOperations] },
  { name: "negative_keywords", operations: [...campaignBudgetOperation, ...campaignOperation, ...adGroupOperation, ...positiveKeywordOperations, ...negativeKeywordOperations] },
  { name: "responsive_search_ad", operations: [...campaignBudgetOperation, ...campaignOperation, ...adGroupOperation, ...positiveKeywordOperations, ...negativeKeywordOperations, ...adGroupAdOperation] },
 ].filter((phase) => phase.operations.length > 0);
}

async function logGoogleAdsMutatePhaseDiagnostics(path: string, input: GoogleAdsRequestInput & { targetCustomerId?: string | null }) {
 const phases = mutateDiagnosticPhases(input.body);
 if (!phases.length) return;
 for (const phase of phases) {
  const startedAt = now();
  try {
   await googleAdsRequest(path, {
    accessToken: input.accessToken,
    method: input.method,
    customerId: input.targetCustomerId ?? input.customerId ?? null,
    loginCustomerId: input.loginCustomerId,
    body: {
     mutateOperations: phase.operations,
     partialFailure: false,
     validateOnly: true,
    },
   });
   logGoogleAdsDiagnostic("Google Ads mutate phase validation completed", {
    stage: "google_ads_mutate_phase_validation",
    provider: "google_ads_api",
    phase: phase.name,
    durationMs: durationMs(startedAt),
    customerId: input.targetCustomerId ?? input.customerId ?? null,
    loginCustomerId: input.loginCustomerId ?? null,
    requestSummary: stableJson(summarizeMutateBody({ mutateOperations: phase.operations })),
    result: "ok",
   });
  } catch (error) {
   const requestError = error instanceof GoogleAdsRequestError ? error : null;
   logGoogleAdsErrorDiagnostic("Google Ads mutate phase validation failed", {
    stage: "google_ads_mutate_phase_validation",
    provider: "google_ads_api",
    phase: phase.name,
    durationMs: durationMs(startedAt),
    customerId: input.targetCustomerId ?? input.customerId ?? null,
    loginCustomerId: input.loginCustomerId ?? null,
    requestSummary: stableJson(summarizeMutateBody({ mutateOperations: phase.operations })),
    errorName: error instanceof Error ? error.name : "unknown",
    errorStatus: requestError?.status ?? null,
    googleStatus: requestError?.googleStatus ?? null,
    googleDetails: stableJson(safeGoogleAdsDetails(requestError?.details)),
   });
   break;
  }
 }
}

export function googleAdsErrorMessage(error: GoogleAdsRequestError | Error) {
 if (error instanceof GoogleAdsRequestError && googleAdsPermissionDenied(error.message, error.status)) {
  const detail = error.details[0];
  const detailCode = detail?.errorCode ? Object.keys(detail.errorCode)[0] : "";
  if (/USER_PERMISSION_DENIED|ACTION_NOT_PERMITTED/i.test(`${error.googleStatus ?? ""} ${detailCode} ${error.message}`)) {
   return "Google Ads denied this publish request. Make sure the connected Google user has admin or standard access to the selected Google Ads account, then reconnect and try again.";
  }
  return "Google Ads denied this publish request. Reconnect the correct Google Ads account or confirm the connected Google user has permission to manage it.";
 }
 return error.message;
}

async function googleAdsRequest<T>(path: string, input: GoogleAdsRequestInput) {
 const { developerToken } = credentials();
 if (!developerToken) throw new Error("Google Ads developer token is not configured.");
 const startedAt = now();
 const requestUrl = `${adsApiBase}${path}`;
 const targetCustomerId = input.customerId ?? null;
 const headers: Record<string, string> = {
  Authorization: `Bearer ${input.accessToken}`,
  "developer-token": developerToken,
  "Content-Type": "application/json",
 };
 const loginCustomerId = input.loginCustomerId === undefined ? input.customerId ?? null : input.loginCustomerId;
 if (loginCustomerId) headers["login-customer-id"] = stripCustomerId(loginCustomerId);
 logGoogleAdsDiagnostic("Google Ads API request started", {
  stage: "google_ads_api_request",
  provider: "google_ads_api",
  endpointHost: "googleads.googleapis.com",
  endpointPath: path,
  method: input.method || "POST",
  customerId: targetCustomerId,
  loginCustomerId,
  requestSummary: stableJson(summarizeMutateBody(input.body)),
 });
 const response = await fetch(`${adsApiBase}${path}`, {
  method: input.method || "POST",
  headers,
  body: input.body === undefined ? undefined : JSON.stringify(input.body),
  cache: "no-store",
 });
 const text = await response.text();
 let result: T & GoogleAdsErrorResponse;
 try {
  result = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string } };
 } catch {
  if (response.status === 404) {
   throw new Error("Google Ads could not be reached with the configured API version. Please retry the connection.");
  }
  throw new Error(`Google Ads returned an invalid response (${response.status}).`);
 }
 if (!response.ok) {
  const sanitizedResult = result?.error ? {
   code: result.error.code ?? null,
   message: result.error.message ?? null,
   status: result.error.status ?? null,
   details: safeGoogleAdsDetails(result.error.details),
  } : null;
  logGoogleAdsErrorDiagnostic("Google Ads API request failed", {
   stage: "google_ads_api_request",
   provider: "google_ads_api",
   endpointHost: "googleads.googleapis.com",
   endpointPath: path,
   httpStatus: response.status,
   requestPath: requestUrl,
   method: input.method || "POST",
   durationMs: durationMs(startedAt),
   loginCustomerId,
   targetCustomerId: input.customerId ?? null,
   googleErrorCode: result.error?.code ?? null,
   googleStatus: result.error?.status ?? null,
   googleMessage: result.error?.message ?? null,
   googleDetails: stableJson(sanitizedResult?.details ?? []),
   googleFailureDetails: stableJson(safeGoogleAdsFailurePayload(result.error?.details)),
   requestSummary: stableJson(summarizeMutateBody(input.body)),
   responseBody: stableJson(sanitizedResult),
  });
  if (response.status === 400 && path.includes("/googleAds:mutate")) {
   await logGoogleAdsMutatePhaseDiagnostics(path, {
    accessToken: input.accessToken,
    method: input.method,
    customerId: input.customerId ?? null,
    targetCustomerId: input.customerId ?? null,
    loginCustomerId,
    body: input.body,
   });
  }
  if (response.status === 404) {
   throw new Error("Google Ads could not be reached with the configured API version. Please retry the connection.");
  }
  throw new GoogleAdsRequestError({
   message: result.error?.message || `Google Ads request failed (${response.status}).`,
   status: response.status,
   googleStatus: result.error?.status ?? null,
   details: result.error?.details ?? [],
   loginCustomerId,
   targetCustomerId: input.customerId ?? null,
  });
 }
 logGoogleAdsDiagnostic("Google Ads API request completed", {
  stage: "google_ads_api_request",
  provider: "google_ads_api",
  endpointHost: "googleads.googleapis.com",
  endpointPath: path,
  method: input.method || "POST",
  httpStatus: response.status,
  durationMs: durationMs(startedAt),
  customerId: targetCustomerId,
  loginCustomerId,
 });
 return result;
}

async function googleAdsRequestWithLoginFallbacks<T>(path: string, input: GoogleAdsRequestInput & {
 targetCustomerId?: string | null;
 loginCustomerIds?: Array<string | null | undefined>;
}) {
 const attempts: Array<string | null> = [];
 for (const value of input.loginCustomerIds ?? []) {
  if (value == null) {
   if (!attempts.includes(null)) attempts.push(null);
   continue;
  }
  const normalized = stripCustomerId(value);
  if (normalized && !attempts.includes(normalized)) attempts.push(normalized);
 }
 if (!attempts.includes(null)) attempts.push(null);
 let lastError: Error | null = null;
 for (const loginCustomerId of attempts) {
  try {
   return await googleAdsRequest<T>(path, {
    accessToken: input.accessToken,
    method: input.method,
    customerId: input.targetCustomerId ?? input.customerId ?? null,
    loginCustomerId,
    body: input.body,
   });
  } catch (error) {
   const current = error instanceof Error ? error : new Error("Google Ads request failed.");
   lastError = current;
   const status = current instanceof GoogleAdsRequestError ? current.status : 403;
   if (!googleAdsPermissionDenied(current.message, status) || loginCustomerId === attempts.at(-1)) throw current;
  }
 }
 throw lastError ?? new Error("Google Ads request failed.");
}

async function googleAdsSearchStream(customerId: string, accessToken: string, query: string) {
 const { developerToken } = credentials();
 if (!developerToken) throw new Error("Google Ads developer token is not configured.");
 const response = await fetch(`${adsApiBase}/customers/${stripCustomerId(customerId)}/googleAds:searchStream`, {
  method: "POST",
  headers: {
   Authorization: `Bearer ${accessToken}`,
   "developer-token": developerToken,
   "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
  cache: "no-store",
 });
 const text = await response.text();
 let chunks: GoogleAdsSearchStreamChunk[] = [];
 try {
  chunks = (text ? JSON.parse(text) : []) as GoogleAdsSearchStreamChunk[];
 } catch {
  throw new Error(`Google Ads returned an invalid report response (${response.status}).`);
 }
 if (!response.ok) throw new Error(chunks[0]?.error?.message || `Google Ads report request failed (${response.status}).`);
 return chunks.flatMap((chunk) => chunk.results ?? []);
}

async function accessibleCustomers(accessToken: string): Promise<GoogleAdsCustomer[]> {
 const list = await googleAdsRequest<GoogleAdsListResponse>("/customers:listAccessibleCustomers", {
  accessToken,
  method: "GET",
 });
 const ids = uniqueStrings((list.resourceNames ?? []).map((name) => name.split("/").pop() ?? ""));
 return ids.map((id) => ({ id, label: id }));
}

export async function exchangeGoogleAdsCode(code: string, context: { businessId?: string | null; businessSlug?: string | null } = {}) {
 const { clientId, clientSecret } = credentials();
 if (!clientId || !clientSecret) throw new Error("Google Ads OAuth is not configured.");
 return tokenRequest(new URLSearchParams({
  code,
  client_id: clientId,
  client_secret: clientSecret,
  redirect_uri: googleAdsRedirectUri(),
  grant_type: "authorization_code",
 }), {
  stage: "google_ads_authorization_code_exchange",
  businessId: context.businessId ?? null,
  businessSlug: context.businessSlug ?? null,
  codePresent: Boolean(code),
 });
}

export function createGoogleAdsOauthState(businessSlug: string, businessId: string) {
 return { state: randomBytes(24).toString("base64url"), businessSlug, businessId };
}

export function googleAdsOauthUrl(state: string) {
 const { clientId } = credentials();
 if (!clientId) throw new Error("Google Ads OAuth is not configured.");
 const url = new URL(oauthBase);
 url.searchParams.set("client_id", clientId);
 url.searchParams.set("redirect_uri", googleAdsRedirectUri());
 url.searchParams.set("response_type", "code");
 url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
 url.searchParams.set("access_type", "offline");
 url.searchParams.set("prompt", "consent");
 url.searchParams.set("state", state);
 logGoogleAdsDiagnostic("Google Ads OAuth authorization URL created", {
  stage: "google_ads_oauth_authorization_redirect",
  provider: "google_oauth",
  redirectUri: googleAdsRedirectUri(),
  googleClientIdConfigured: Boolean(clientId),
  googleClientSecretConfigured: Boolean(credentials().clientSecret),
  googleAdsDeveloperTokenConfigured: Boolean(credentials().developerToken),
 });
 return url;
}

function finalUrl(input: GoogleAdsDraftInput) {
 if (input.website?.customDomain && input.website.domainStatus === "connected") return `https://${input.website.customDomain}`;
 if (input.website?.publicSlug && input.website.status === "published") return `${appBaseUrl}/sites/${input.website.publicSlug}`;
 return `${appBaseUrl}/book/${input.businessName ? slugify(input.businessName) : "business"}`;
}

function keywordBase(input: GoogleAdsDraftInput) {
 const core = input.service?.name || input.rentalItem?.name || input.industry?.replaceAll("_", " ") || "local service";
 const city = input.businessLocation.city;
 const state = input.businessLocation.state;
 const localBits = uniqueStrings([city ?? "", state ? `${city ?? ""} ${state}`.trim() : "", "near me"]);
 return uniqueStrings([
  core,
  `${core} near me`,
  `${core} company`,
  `${core} service`,
  ...localBits.map((bit) => bit ? `${core} ${bit}` : "").filter(Boolean),
 ]);
}

function copyBase(input: GoogleAdsDraftInput) {
 const businessName = stableTitle(input.businessName);
 const serviceLabel = stableTitle(input.service?.name || input.rentalItem?.name || input.industry?.replaceAll("_", " ") || "local service");
 const city = input.businessLocation.city;
 const state = input.businessLocation.state;
 const location = [city, state].filter(Boolean).join(", ") || input.serviceAreas[0] || "your service area";
 return { businessName, serviceLabel, location };
}

async function generateDraftWithAi(input: GoogleAdsDraftInput): Promise<GoogleAdsDraft | null> {
 const apiKey = process.env.OPENAI_API_KEY?.trim();
 if (!apiKey) return null;
 const { businessName, serviceLabel, location } = copyBase(input);
 const prompt = [
  "Return strict JSON with keys campaignName, adGroupName, keywords, negativeKeywords, headlines, descriptions.",
  "Create a simple local-service Google Search campaign draft for a small business.",
  `Business: ${businessName}`,
  `Industry: ${input.industry ?? "unknown"}`,
  `Primary offer: ${serviceLabel}`,
  `Location target: ${input.geoTargetType} / ${input.geoValues.join(", ") || location}`,
  `Website context: ${[input.website?.heroHeading, input.website?.heroSubheading, input.website?.aboutText, input.service?.description, input.rentalItem?.description].filter(Boolean).join(" | ")}`,
  "Requirements: 8-12 high intent keywords, 6-10 negative keywords, 10-12 headlines under 30 chars, 3-4 descriptions under 90 chars. No exaggerated claims. No markdown.",
 ].join("\n");
 const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
   Authorization: `Bearer ${apiKey}`,
   "Content-Type": "application/json",
  },
  body: JSON.stringify({
   model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
   temperature: 0.4,
   response_format: { type: "json_object" },
   messages: [
    { role: "system", content: "You create concise, policy-safe local service Google Ads drafts." },
    { role: "user", content: prompt },
   ],
  }),
 });
 if (!response.ok) return null;
 const body = await response.json() as any;
 const content = body.choices?.[0]?.message?.content;
 if (!content || typeof content !== "string") return null;
 let parsed: Record<string, unknown>;
 try {
  parsed = JSON.parse(content) as Record<string, unknown>;
 } catch {
  return null;
 }
 try {
  await recordAssistantProviderUsage({
   businessId: input.businessId,
   userId: input.userId,
   conversationId: null as unknown as string,
   usage: {
    provider: "openai",
    model: String(body.model || process.env.OPENAI_ASSISTANT_MODEL || "gpt-4.1-mini"),
    requestId: typeof body.id === "string" ? body.id : null,
    inputTokens: safeNumber(body.usage?.prompt_tokens),
    cachedInputTokens: safeNumber(body.usage?.prompt_tokens_details?.cached_tokens),
    outputTokens: safeNumber(body.usage?.completion_tokens),
    totalTokens: safeNumber(body.usage?.total_tokens),
    occurredAt: new Date().toISOString(),
   },
  });
 } catch {
  // Usage recording should never block campaign generation.
 }
 return {
  campaignName: stableTitle(jsonText(parsed.campaignName)) || `${input.businessName} ${input.service?.name || input.rentalItem?.name || "Campaign"}`,
  adGroupName: stableTitle(jsonText(parsed.adGroupName)) || `${input.service?.name || input.rentalItem?.name || "Core"} Ad Group`,
  destinationUrl: finalUrl(input),
  geoTargetSummary: "",
  geoTargetConfig: {},
  keywords: uniqueStrings(Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : []).slice(0, 12),
  negativeKeywords: uniqueStrings(Array.isArray(parsed.negativeKeywords) ? parsed.negativeKeywords.map(String) : []).slice(0, 10),
  headlines: uniqueStrings(Array.isArray(parsed.headlines) ? parsed.headlines.map(String) : []).slice(0, 12),
  descriptions: uniqueStrings(Array.isArray(parsed.descriptions) ? parsed.descriptions.map(String) : []).slice(0, 4),
  aiGenerated: true,
 };
}

export async function generateGoogleAdsDraft(input: GoogleAdsDraftInput): Promise<GoogleAdsDraft> {
 const businessName = stableTitle(input.businessName);
 const { serviceLabel, location } = copyBase(input);
 const geoValues = uniqueStrings(input.geoValues.length ? input.geoValues : input.serviceAreas);
 const geoTargetSummary = input.geoTargetType === "radius" && input.radiusMiles
  ? `${input.radiusMiles} mile radius around ${location}`
  : geoValues.slice(0, 5).join(", ") || location;
 const geoTargetConfig = {
  type: input.geoTargetType,
  values: geoValues,
  radiusMiles: input.radiusMiles,
 };
 const aiDraft = await generateDraftWithAi(input);
 const fallbackKeywords = keywordBase(input).slice(0, 10);
 const headlines = uniqueStrings([
  `${serviceLabel} Near You`,
  `${businessName} ${input.service ? "Experts" : "Team"}`,
  `${serviceLabel} in ${input.businessLocation.city ?? "Your Area"}`,
  `Book ${serviceLabel} Today`,
  `Trusted Local ${serviceLabel}`,
  `Fast ${serviceLabel} Quotes`,
  `${serviceLabel} From ${businessName}`,
  `${serviceLabel} Appointments`,
  `${input.businessLocation.city ?? "Local"} ${serviceLabel}`,
  `Reliable ${serviceLabel} Help`,
 ].map((value) => value.slice(0, 30))).slice(0, 12);
 const descriptions = uniqueStrings([
  `${businessName} helps customers in ${location} with dependable ${serviceLabel.toLowerCase()} and clear communication.`,
  `Review your options, request service, and reach a local team without dealing with a complicated ad experience.`,
  `Choose a local business for ${serviceLabel.toLowerCase()} with transparent scheduling and a professional customer experience.`,
  `Google bills your connected account directly while Servonas keeps campaign setup simple.`,
 ].map((value) => value.slice(0, 90))).slice(0, 4);
 return {
  campaignName: aiDraft?.campaignName || `${businessName} ${serviceLabel}`.slice(0, 80),
  adGroupName: aiDraft?.adGroupName || `${serviceLabel} Core`.slice(0, 80),
  destinationUrl: finalUrl(input),
  geoTargetSummary,
  geoTargetConfig,
  keywords: aiDraft?.keywords.length ? aiDraft.keywords : fallbackKeywords,
  negativeKeywords: aiDraft?.negativeKeywords.length ? aiDraft.negativeKeywords : defaultNegativeKeywords,
  headlines: aiDraft?.headlines.length ? aiDraft.headlines : headlines,
  descriptions: aiDraft?.descriptions.length ? aiDraft.descriptions : descriptions,
  aiGenerated: Boolean(aiDraft?.aiGenerated),
 };
}

export async function storeGoogleAdsConnection(input: {
 businessId: string;
 userId: string;
 refreshToken: string;
 customers: GoogleAdsCustomer[];
 selectedCustomerId?: string | null;
}) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads connection storage is unavailable.");
 logGoogleAdsDiagnostic("Google Ads connection persistence started", {
  stage: "persist_connection",
  provider: "supabase",
  businessId: input.businessId,
  businessSlug: null,
 });
 const selected = input.selectedCustomerId && input.customers.some((customer) => customer.id === input.selectedCustomerId)
  ? input.selectedCustomerId
  : input.customers.length === 1
   ? input.customers[0].id
   : null;
 const { error } = await db.from("business_google_ads_connections").upsert({
  business_id: input.businessId,
  connected_by: input.userId,
  refresh_token: input.refreshToken,
  google_ads_customer_id: selected,
  accessible_customer_ids: input.customers.map((customer) => customer.id),
  accessible_customer_labels: Object.fromEntries(input.customers.map((customer) => [customer.id, customer.label])),
  status: selected ? "connected" : "pending_selection",
  connected_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
 }, { onConflict: "business_id" });
 if (error) throw new Error("Google Ads connection could not be saved. Apply the Google Ads migration.");
 logGoogleAdsDiagnostic("Google Ads connection persistence completed", {
  stage: "persist_connection",
  provider: "supabase",
  status: 201,
  businessId: input.businessId,
  businessSlug: null,
  customerCount: input.customers.length,
  selectedCustomerId: selected,
 });
}

export async function completeGoogleAdsOauth(code: string, context: { businessId?: string | null; businessSlug?: string | null } = {}) {
 logGoogleAdsDiagnostic("Google Ads OAuth completion started", {
  stage: "google_ads_oauth_completion",
  provider: "google_oauth",
  businessId: context.businessId ?? null,
  businessSlug: context.businessSlug ?? null,
  hasAuthorizationCode: Boolean(code),
  redirectUri: googleAdsRedirectUri(),
 });
 const token = await exchangeGoogleAdsCode(code, context);
 if (!token.refresh_token) throw new Error("Google did not provide long-term Google Ads access. Remove Servonas from Google permissions and connect again.");
 const customers = await accessibleCustomers(token.access_token!);
 logGoogleAdsDiagnostic("Google Ads OAuth completion finished", {
  stage: "google_ads_oauth_completion",
  provider: "google_oauth",
  businessId: context.businessId ?? null,
  businessSlug: context.businessSlug ?? null,
  redirectUri: googleAdsRedirectUri(),
  refreshTokenReturned: Boolean(token.refresh_token),
  accessTokenReturned: Boolean(token.access_token),
  customerCount: customers.length,
 });
 return { refreshToken: token.refresh_token, customers };
}

export async function loadTenantGoogleAdsAccess(businessId: string) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads access is unavailable.");
 logGoogleAdsDiagnostic("Google Ads connection load started", {
  stage: "load_google_ads_connection",
  provider: "supabase",
  businessId,
  businessSlug: null,
 });
 const { data: connection } = await db.from("business_google_ads_connections")
 .select("refresh_token,google_ads_customer_id,accessible_customer_ids,accessible_customer_labels,status")
  .eq("business_id", businessId)
  .maybeSingle();
 logGoogleAdsDiagnostic("Google Ads connection load completed", {
  stage: "load_google_ads_connection",
  provider: "supabase",
  status: 200,
  businessId,
  businessSlug: null,
  connectionStatus: connection?.status ?? "disconnected",
  hasRefreshToken: Boolean(connection?.refresh_token),
  selectedCustomerId: connection?.google_ads_customer_id ?? null,
 });
 if (!connection || connection.status === "disconnected") return null;
 try {
  const accessToken = await refreshGoogleAdsAccessToken(connection.refresh_token, { businessId });
  return {
   accessToken,
   customerId: connection.google_ads_customer_id as string | null,
   customerChoices: (connection.accessible_customer_ids ?? []).map((id: string) => ({
    id,
    label: String((connection.accessible_customer_labels as Record<string, unknown> | null)?.[id] ?? id),
   })),
   status: connection.status as GoogleAdsConnectionStatus,
  };
 } catch (error) {
  logGoogleAdsErrorDiagnostic("Google Ads connection refresh failed", {
   stage: "update_connection_status",
   provider: "supabase",
   businessId,
   businessSlug: null,
   status: 400,
   error: error instanceof Error ? error.message : "Google Ads authorization expired.",
  });
  await db.from("business_google_ads_connections")
   .update({ status: "reauthorization_required", updated_at: new Date().toISOString() })
   .eq("business_id", businessId);
  throw new Error(error instanceof Error ? error.message : "Google Ads authorization expired.");
 }
}

export async function updateTenantGoogleAdsSelection(businessId: string, customerId: string) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads connection storage is unavailable.");
 const { data: connection } = await db.from("business_google_ads_connections")
  .select("accessible_customer_ids")
  .eq("business_id", businessId)
  .maybeSingle();
 const available = new Set((connection?.accessible_customer_ids ?? []) as string[]);
 if (!available.has(customerId)) throw new Error("Choose a Google Ads customer that was returned by Google.");
 const { error } = await db.from("business_google_ads_connections")
  .update({ google_ads_customer_id: customerId, status: "connected", updated_at: new Date().toISOString() })
  .eq("business_id", businessId);
 if (error) throw new Error("Google Ads account selection could not be saved.");
}

export async function disconnectTenantGoogleAds(businessId: string) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads connection storage is unavailable.");
 const { error } = await db.from("business_google_ads_connections")
  .update({
   status: "disconnected",
   google_ads_customer_id: null,
   accessible_customer_ids: [],
   accessible_customer_labels: {},
   updated_at: new Date().toISOString(),
  })
  .eq("business_id", businessId);
 if (error) throw new Error("Google Ads could not be disconnected.");
}

function resourceName(resource: string, id: string) {
 return `customers/${id}/${resource}`;
}

function mutateOperationsForCampaign(input: {
 customerId: string;
 campaignName: string;
 adGroupName: string;
 dailyBudgetMicros: number;
 destinationUrl: string;
 keywords: string[];
 negativeKeywords: string[];
 headlines: string[];
 descriptions: string[];
}) {
 const customerId = stripCustomerId(input.customerId);
 const budgetTemp = `${resourceName("campaignBudgets", customerId)}/-1`;
 const campaignTemp = `${resourceName("campaigns", customerId)}/-2`;
 const adGroupTemp = `${resourceName("adGroups", customerId)}/-3`;
 return [
  {
   campaignBudgetOperation: {
    create: {
     name: `${input.campaignName} Budget`,
     amountMicros: String(input.dailyBudgetMicros),
     deliveryMethod: "STANDARD",
    },
   },
  },
  {
   campaignOperation: {
    create: {
     name: input.campaignName,
     advertisingChannelType: "SEARCH",
     status: "PAUSED",
     campaignBudget: budgetTemp,
     manualCpc: {},
    },
   },
  },
  {
   adGroupOperation: {
    create: {
     name: input.adGroupName,
     campaign: campaignTemp,
     status: "ENABLED",
     type: "SEARCH_STANDARD",
    },
   },
  },
  ...normalizeGoogleAdsKeywords(input.keywords).map((keyword) => ({
   adGroupCriterionOperation: {
    create: {
     adGroup: adGroupTemp,
     status: "ENABLED",
     keyword: { text: keyword, matchType: "PHRASE" },
    },
   },
  })),
  ...normalizeGoogleAdsKeywords(input.negativeKeywords).map((keyword) => ({
   adGroupCriterionOperation: {
    create: {
     adGroup: adGroupTemp,
     negative: true,
     keyword: { text: keyword, matchType: "PHRASE" },
    },
   },
  })),
  {
   adGroupAdOperation: {
    create: {
     adGroup: adGroupTemp,
     status: "ENABLED",
     ad: {
      finalUrls: [input.destinationUrl],
      responsiveSearchAd: {
       headlines: input.headlines.map((text) => ({ text })),
       descriptions: input.descriptions.map((text) => ({ text })),
      },
      },
     },
    },
   },
 ];
}

export async function publishGoogleAdsCampaign(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 campaignName: string;
 adGroupName: string;
 dailyBudgetMicros: number;
 destinationUrl: string;
 keywords: string[];
 negativeKeywords: string[];
 headlines: string[];
 descriptions: string[];
}) {
 const result = await googleAdsRequestWithLoginFallbacks<{ mutateOperationResponses?: any[] }>("/customers/" + stripCustomerId(input.customerId) + "/googleAds:mutate", {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [input.customerId, ...(input.loginCustomerIds ?? []), null],
  body: {
   mutateOperations: mutateOperationsForCampaign({
    ...input,
    headlines: limitGoogleAdsTextAssets(input.headlines, maxGoogleAdsHeadlines),
    descriptions: limitGoogleAdsTextAssets(input.descriptions, maxGoogleAdsDescriptions),
   }),
   partialFailure: false,
   validateOnly: false,
  },
 });
 const responses = result.mutateOperationResponses ?? [];
 const campaignBudget = responses.find((row) => row.campaignBudgetResult?.resourceName)?.campaignBudgetResult?.resourceName ?? null;
 const campaign = responses.find((row) => row.campaignResult?.resourceName)?.campaignResult?.resourceName ?? null;
 const adGroup = responses.find((row) => row.adGroupResult?.resourceName)?.adGroupResult?.resourceName ?? null;
 return {
  campaignBudgetResourceName: typeof campaignBudget === "string" ? campaignBudget : null,
  campaignId: typeof campaign === "string" ? campaign.split("/").pop() ?? null : null,
  adGroupId: typeof adGroup === "string" ? adGroup.split("/").pop() ?? null : null,
 };
}

export async function updateGoogleAdsCampaignStatus(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 campaignId: string;
 status: "ENABLED" | "PAUSED";
}) {
 return googleAdsRequestWithLoginFallbacks(`/customers/${stripCustomerId(input.customerId)}/campaigns:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [input.customerId, ...(input.loginCustomerIds ?? []), null],
  body: {
   operations: [{
    update: {
     resourceName: `customers/${stripCustomerId(input.customerId)}/campaigns/${stripCustomerId(input.campaignId)}`,
     status: input.status,
    },
    updateMask: "status",
   }],
  },
 });
}

export async function updateGoogleAdsCampaignBudget(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 budgetResourceName: string;
 dailyBudgetMicros: number;
}) {
 return googleAdsRequestWithLoginFallbacks(`/customers/${stripCustomerId(input.customerId)}/campaignBudgets:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [input.customerId, ...(input.loginCustomerIds ?? []), null],
  body: {
   operations: [{
    update: {
     resourceName: input.budgetResourceName,
     amountMicros: String(input.dailyBudgetMicros),
    },
    updateMask: "amount_micros",
   }],
  },
 });
}

export async function fetchGoogleAdsCampaignMetrics(input: { accessToken: string; customerId: string; dateFrom: string; dateTo: string }) {
 const range = `${input.dateFrom.replaceAll("-", "")},${input.dateTo.replaceAll("-", "")}`;
 const results = await googleAdsSearchStream(
  input.customerId,
  input.accessToken,
  `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion FROM campaign WHERE campaign.status != 'REMOVED' DURING CUSTOM_DATE_RANGE [${range}]`,
 );
 return results.map((row) => {
  const campaign = row.campaign as Record<string, unknown> | undefined;
  const metrics = row.metrics as Record<string, unknown> | undefined;
  return {
   campaignId: String(campaign?.id ?? ""),
   impressions: safeNumber(metrics?.impressions),
   clicks: safeNumber(metrics?.clicks),
   ctr: safeNumber(metrics?.ctr),
   averageCpcMicros: safeNumber(metrics?.averageCpc),
   costMicros: safeNumber(metrics?.costMicros),
   conversions: safeNumber(metrics?.conversions),
   costPerConversionMicros: safeNumber(metrics?.costPerConversion),
   status: String(campaign?.status ?? "UNKNOWN"),
  } satisfies GoogleAdsCampaignMetrics;
 }).filter((row) => row.campaignId);
}

export async function fetchGoogleAdsSearchTerms(input: { accessToken: string; customerId: string; campaignIds: string[]; dateFrom: string; dateTo: string }) {
 if (!input.campaignIds.length) return [] as GoogleAdsSearchTerm[];
 const ids = input.campaignIds.map((value) => stripCustomerId(value)).filter(Boolean).join(",");
 const range = `${input.dateFrom.replaceAll("-", "")},${input.dateTo.replaceAll("-", "")}`;
 const results = await googleAdsSearchStream(
  input.customerId,
  input.accessToken,
  `SELECT campaign.id, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions, metrics.cost_micros FROM search_term_view WHERE campaign.id IN (${ids}) DURING CUSTOM_DATE_RANGE [${range}]`,
 );
 return results.map((row) => {
  const campaign = row.campaign as Record<string, unknown> | undefined;
  const metrics = row.metrics as Record<string, unknown> | undefined;
  const searchTermView = row.searchTermView as Record<string, unknown> | undefined;
  return {
   campaignId: String(campaign?.id ?? ""),
   term: String(searchTermView?.searchTerm ?? ""),
   impressions: safeNumber(metrics?.impressions),
   clicks: safeNumber(metrics?.clicks),
   ctr: safeNumber(metrics?.ctr),
   conversions: safeNumber(metrics?.conversions),
   costMicros: safeNumber(metrics?.costMicros),
  } satisfies GoogleAdsSearchTerm;
 }).filter((row) => row.campaignId && row.term);
}

export async function appendGoogleAdsNegativeKeyword(input: { accessToken: string; customerId: string; adGroupId: string; keyword: string }) {
 return googleAdsRequest(`/customers/${stripCustomerId(input.customerId)}/adGroupCriteria:mutate`, {
  accessToken: input.accessToken,
  body: {
   operations: [{
    create: {
     adGroup: `customers/${stripCustomerId(input.customerId)}/adGroups/${stripCustomerId(input.adGroupId)}`,
     negative: true,
     keyword: { text: input.keyword.trim(), matchType: "PHRASE" },
    },
   }],
  },
 });
}

export async function writeGoogleAdsAuditLog(input: {
 businessId: string;
 campaignId?: string | null;
 actorUserId?: string | null;
 eventType: string;
 metadata?: Record<string, unknown>;
}) {
 const db = getSupabaseAdmin();
 if (!db) return;
 logGoogleAdsDiagnostic("Google Ads audit log write started", {
  stage: "audit_event",
  provider: "supabase",
  businessId: input.businessId,
  businessSlug: null,
  eventType: input.eventType,
 });
 await db.from("business_google_ads_audit_log").insert({
  business_id: input.businessId,
  campaign_id: input.campaignId ?? null,
  actor_user_id: input.actorUserId ?? null,
  event_type: input.eventType,
  metadata: input.metadata ?? {},
 });
 logGoogleAdsDiagnostic("Google Ads audit log write completed", {
  stage: "audit_event",
  provider: "supabase",
  status: 201,
  businessId: input.businessId,
  businessSlug: null,
  eventType: input.eventType,
 });
}

export async function recordGoogleAdsBetaEvent(input: {
 businessId: string;
 actorUserId?: string | null;
 campaignId?: string | null;
 eventName: string;
 metadata?: Record<string, unknown>;
}) {
 const db = getSupabaseAdmin();
 if (!db) return;
 logGoogleAdsDiagnostic("Google Ads beta event write started", {
  stage: "audit_event",
  provider: "supabase",
  businessId: input.businessId,
  businessSlug: typeof input.metadata?.business_slug === "string" ? input.metadata.business_slug : null,
  eventName: input.eventName,
 });
 const { error } = await db.from("business_google_ads_beta_events").insert({
  business_id: input.businessId,
  actor_user_id: input.actorUserId ?? null,
  campaign_id: input.campaignId ?? null,
  event_name: input.eventName,
  metadata: input.metadata ?? {},
 });
 if (error) console.error("Google Ads beta analytics could not be recorded", { stage: "audit_event", provider: "supabase", businessId: input.businessId, businessSlug: typeof input.metadata?.business_slug === "string" ? input.metadata.business_slug : null, eventName: input.eventName, code: error.code });
 else logGoogleAdsDiagnostic("Google Ads beta event write completed", {
  stage: "audit_event",
  provider: "supabase",
  status: 201,
  businessId: input.businessId,
  businessSlug: typeof input.metadata?.business_slug === "string" ? input.metadata.business_slug : null,
  eventName: input.eventName,
 });
}

export async function submitGoogleAdsBetaFeedback(input: {
 businessId: string;
 actorUserId?: string | null;
 rating: "confused" | "neutral" | "successful";
 feedback: string;
 metadata?: Record<string, unknown>;
}) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads beta feedback is unavailable.");
 const { error } = await db.from("business_google_ads_beta_feedback").insert({
  business_id: input.businessId,
  actor_user_id: input.actorUserId ?? null,
  rating: input.rating,
  feedback: input.feedback.trim(),
  metadata: input.metadata ?? {},
 });
 if (error) throw new Error("Google Ads beta feedback could not be saved. Apply the latest Google Ads beta migration.");
}

export function googleAdsReadyLabel() {
 return oauthConfigured() ? "ready" : "missing_configuration";
}

export function estimateMonthlyBudgetCents(dailyBudgetDollars: number) {
 return Math.round(dailyBudgetDollars * 30 * 100);
}

export function currentBillingPeriodStart() {
 return monthStart(new Date().toISOString());
}
