import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { recordAssistantProviderUsage } from "./assistant/usage";

type TokenResponse = { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
type GoogleAdsListResponse = { resourceNames?: string[] };
type GoogleAdsSearchStreamChunk = { results?: Record<string, unknown>[]; error?: { message?: string } };

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
const jsonText = (value: unknown) => typeof value === "string" ? value : "";

function safeNumber(value: unknown) {
 const numeric = Number(value);
 return Number.isFinite(numeric) ? numeric : 0;
}

function oauthConfigured() {
 const { clientId, clientSecret, developerToken } = credentials();
 return Boolean(clientId && clientSecret && developerToken);
}

export const googleAdsRedirectUri = () => `${appBaseUrl}/api/google-ads/callback`;

async function tokenRequest(params: URLSearchParams) {
 const response = await fetch(tokenEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params,
  cache: "no-store",
 });
 const result = await response.json() as TokenResponse;
 if (!response.ok || !result.access_token) throw new Error(result.error_description || result.error || "Google Ads authorization failed.");
 return result;
}

async function refreshGoogleAdsAccessToken(refreshToken: string) {
 const { clientId, clientSecret } = credentials();
 if (!clientId || !clientSecret) throw new Error("Google Ads OAuth is not configured.");
 return (await tokenRequest(new URLSearchParams({
  refresh_token: refreshToken,
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: "refresh_token",
 }))).access_token!;
}

type GoogleAdsRequestInput = {
 accessToken: string;
 method?: string;
 customerId?: string | null;
 loginCustomerId?: string | null;
 body?: unknown;
};

function googleAdsPermissionDenied(message: string, status: number) {
 return status === 403 || /permission/i.test(message) || /authorization/i.test(message);
}

async function googleAdsRequest<T>(path: string, input: GoogleAdsRequestInput) {
 const { developerToken } = credentials();
 if (!developerToken) throw new Error("Google Ads developer token is not configured.");
 const headers: Record<string, string> = {
  Authorization: `Bearer ${input.accessToken}`,
  "developer-token": developerToken,
  "Content-Type": "application/json",
 };
 const loginCustomerId = input.loginCustomerId ?? input.customerId ?? null;
 if (loginCustomerId) headers["login-customer-id"] = stripCustomerId(loginCustomerId);
 const response = await fetch(`${adsApiBase}${path}`, {
  method: input.method || "POST",
  headers,
  body: input.body === undefined ? undefined : JSON.stringify(input.body),
  cache: "no-store",
 });
 const text = await response.text();
 let result: T & { error?: { message?: string } };
 try {
  result = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string } };
 } catch {
  if (response.status === 404) {
   throw new Error("Google Ads could not be reached with the configured API version. Please retry the connection.");
  }
  throw new Error(`Google Ads returned an invalid response (${response.status}).`);
 }
 if (!response.ok) {
  if (response.status === 404) {
   throw new Error("Google Ads could not be reached with the configured API version. Please retry the connection.");
  }
  throw new Error(result.error?.message || `Google Ads request failed (${response.status}).`);
 }
 return result;
}

async function googleAdsRequestWithLoginFallbacks<T>(path: string, input: GoogleAdsRequestInput & {
 targetCustomerId?: string | null;
 loginCustomerIds?: Array<string | null | undefined>;
}) {
 const attempts = [...new Set((input.loginCustomerIds ?? []).map((value) => value ? stripCustomerId(value) : "").filter(Boolean))];
 if (!attempts.length) attempts.push("");
 let lastError: Error | null = null;
 for (const loginCustomerId of attempts) {
  try {
   return await googleAdsRequest<T>(path, {
    accessToken: input.accessToken,
    method: input.method,
    customerId: input.targetCustomerId ?? input.customerId ?? null,
    loginCustomerId: loginCustomerId || null,
    body: input.body,
   });
  } catch (error) {
   const current = error instanceof Error ? error : new Error("Google Ads request failed.");
   lastError = current;
   if (!googleAdsPermissionDenied(current.message, 403) || loginCustomerId === attempts.at(-1)) throw current;
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

export async function exchangeGoogleAdsCode(code: string) {
 const { clientId, clientSecret } = credentials();
 if (!clientId || !clientSecret) throw new Error("Google Ads OAuth is not configured.");
 return tokenRequest(new URLSearchParams({
  code,
  client_id: clientId,
  client_secret: clientSecret,
  redirect_uri: googleAdsRedirectUri(),
  grant_type: "authorization_code",
 }));
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
}

export async function completeGoogleAdsOauth(code: string) {
 const token = await exchangeGoogleAdsCode(code);
 if (!token.refresh_token) throw new Error("Google did not provide long-term Google Ads access. Remove Servonas from Google permissions and connect again.");
 const customers = await accessibleCustomers(token.access_token!);
 return { refreshToken: token.refresh_token, customers };
}

export async function loadTenantGoogleAdsAccess(businessId: string) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads access is unavailable.");
 const { data: connection } = await db.from("business_google_ads_connections")
  .select("refresh_token,google_ads_customer_id,accessible_customer_ids,accessible_customer_labels,status")
  .eq("business_id", businessId)
  .maybeSingle();
 if (!connection || connection.status === "disconnected") return null;
 try {
  const accessToken = await refreshGoogleAdsAccessToken(connection.refresh_token);
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
     networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
     },
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
  ...input.keywords.map((keyword) => ({
   adGroupCriterionOperation: {
    create: {
     adGroup: adGroupTemp,
     status: "ENABLED",
     keyword: { text: keyword, matchType: "PHRASE" },
    },
   },
  })),
  ...input.negativeKeywords.map((keyword) => ({
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
   mutateOperations: mutateOperationsForCampaign(input),
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
 await db.from("business_google_ads_audit_log").insert({
  business_id: input.businessId,
  campaign_id: input.campaignId ?? null,
  actor_user_id: input.actorUserId ?? null,
  event_type: input.eventType,
  metadata: input.metadata ?? {},
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
 const { error } = await db.from("business_google_ads_beta_events").insert({
  business_id: input.businessId,
  actor_user_id: input.actorUserId ?? null,
  campaign_id: input.campaignId ?? null,
  event_name: input.eventName,
  metadata: input.metadata ?? {},
 });
 if (error) console.error("Google Ads beta analytics could not be recorded", { businessId: input.businessId, eventName: input.eventName, code: error.code });
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
