import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { recordAssistantProviderUsage } from "./assistant/usage";
import { syncBusinessMarketingIssues, type MarketingIssueInput } from "./marketingIssues";
export {confirmGoogleAdsAdGroupCreation,createGoogleAdsAdGroupsIndividually,GoogleAdsAdGroupCreationError} from "./googleAdsAdGroupCreation";

type TokenResponse = { access_token?: string; refresh_token?: string; id_token?: string; error?: string; error_description?: string };
type GoogleAdsListResponse = { resourceNames?: string[] };
type GoogleAdsSearchStreamChunk = { results?: Record<string, unknown>[]; error?: { message?: string } };
type GoogleUserInfoResponse = { email?: string; name?: string };
type GoogleAdsCustomerRow = {
 customer?: {
  id?: string | number;
  descriptiveName?: string;
  manager?: boolean;
  testAccount?: boolean;
 };
};
type GoogleAdsCustomerClientRow = {
 customerClient?: {
  id?: string | number;
  clientCustomer?: string;
  descriptiveName?: string;
  level?: string | number;
  manager?: boolean;
  status?: string;
 };
};
type GoogleAdsErrorDetail = {
 errorCode?: Record<string, unknown>;
 message?: string;
 trigger?: string;
 location?: unknown;
 requestId?: string;
 errors?: Array<{
  errorCode?: Record<string, unknown>;
  message?: string;
  trigger?: string;
  location?: unknown;
 }>;
};
type GoogleAdsErrorResponse = {
 error?: {
  code?: number;
  message?: string;
  status?: string;
  details?: GoogleAdsErrorDetail[];
 };
};
type GoogleAdsDiscoveryState = {
 lastSuccessfulAt: string | null;
 lastAttemptedAt: string | null;
 retryAfterAt: string | null;
 lastHttpStatus: number | null;
 lastGoogleStatus: string | null;
 lastMessage: string | null;
 lastRequestId: string | null;
};

export type GoogleAdsConnectionStatus =
 "oauth_connected"
 | "account_discovery_pending"
 | "account_discovery_rate_limited"
 | "account_selected"
 | "account_access_verified"
 | "reauthorization_required"
 | "disconnected";
export type GoogleAdsCustomer = {
 id: string;
 label: string;
 loginCustomerId: string | null;
 managerCustomerId: string | null;
 isManager: boolean;
 level: number | null;
 status: string | null;
 source: "direct" | "manager_hierarchy";
};
export type GoogleAdsConnectionIdentity = {
 email: string | null;
 name: string | null;
};
export type GoogleAdsOauthCompletionResult = {
 refreshToken: string;
 accessToken: string;
 authenticatedIdentity: GoogleAdsConnectionIdentity;
};
type GoogleAdsDiscoveryResult = {
 ok: boolean;
 rateLimited: boolean;
 retryAfterAt: string | null;
 customers: GoogleAdsCustomer[];
 rootCustomers: GoogleAdsCustomer[];
 selectedCustomerPreserved: boolean;
 selectedCustomerDirectAccessVerified: boolean;
 selectedCustomerId: string | null;
 status: GoogleAdsConnectionStatus;
 userMessage: string;
 requestId: string | null;
 googleStatus: string | null;
 googleMessage: string | null;
};
export type GoogleAdsPermissionDiagnosticCheck = {
 key: "accessible_customers" | "manager_query" | "target_query_through_manager" | "manager_hierarchy";
 label: string;
 passed: boolean;
 provider: "google_ads_api";
 httpStatus: number | null;
 googleStatus: string | null;
 googleMessage: string | null;
 details: string[];
};
export type GoogleAdsPermissionDiagnostic = {
 authenticatedGoogleAccount: GoogleAdsConnectionIdentity;
 managerCustomerId: string | null;
 targetCustomerId: string | null;
 accessibleCustomers: string[];
 accessibleRootCustomers: GoogleAdsCustomer[];
 discoveredManagerAccounts: GoogleAdsCustomer[];
 discoveredAdvertiserAccounts: GoogleAdsCustomer[];
 resolvedLoginCustomerId: string | null;
 checks: GoogleAdsPermissionDiagnosticCheck[];
 classification: string;
};
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
 biddingStrategy: "MAXIMIZE_CLICKS" | "MANUAL_CPC";
 manualCpcBidDollars: number | null;
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
export type GoogleAdsManagedAd = {
 headlines: string[];
 descriptions: string[];
 finalUrl: string;
};
export type GoogleAdsManagedAdGroup = {
 id?: string | null;
 name: string;
 destinationUrl: string;
 keywords: string[];
 negativeKeywords: string[];
 ads: GoogleAdsManagedAd[];
 googleAdGroupId?: string | null;
 cpcBidMicros?: number | null;
};
export type GoogleAdsBiddingStrategy = "MAXIMIZE_CLICKS" | "MANUAL_CPC";
export type GoogleAdsCampaignHealthIssueSeverity = "critical" | "warning" | "info" | "healthy";
export type GoogleAdsCampaignHealthState = "healthy" | "monitoring" | "needs_attention" | "critical_issue";
export type GoogleAdsCampaignHealthFixAction = "increase_manual_cpc" | "setup_booking_conversion";
export type GoogleAdsCampaignHealthDataState = "verified" | "unknown";
export type GoogleAdsCampaignHealthQueryError = { code: string | null; message: string; requestId: string | null; googleStatus: string | null; durationMs: number; gaql: string };
export type GoogleAdsCampaignHealthDataQuality = Record<"campaign" | "adGroups" | "ads" | "keywords" | "conversionGoals", { state: GoogleAdsCampaignHealthDataState; status: "verified" | "empty" | "error"; error: GoogleAdsCampaignHealthQueryError | null }>;
export type GoogleAdsCampaignHealthIssue = {
 id: string;
 severity: GoogleAdsCampaignHealthIssueSeverity;
 title: string;
 description: string;
 currentValue: string | null;
 recommendedAction: string;
 canAutoFix: boolean;
 fixActionId?: GoogleAdsCampaignHealthFixAction;
 category?: "serving" | "optimization" | "conversion_tracking";
};
export type GoogleAdsCampaignHealthSnapshot = {
 campaignId: string;
 biddingStrategyType: string | null;
 campaignStatus: string | null;
 campaignPrimaryStatus: string | null;
 campaignPrimaryStatusReasons: string[];
 adGroupIds: string[];
 adGroupNames: string[];
 adGroupStatuses: string[];
 adGroupPrimaryStatuses: string[];
 adGroupPrimaryStatusReasons: string[];
 adGroupCpcBidMicros: number[];
 keywordStatuses: string[];
 keywordPrimaryStatusReasons: string[];
 positiveKeywords: string[];
 negativeKeywords: string[];
 keywordCpcBidMicros: number[];
 adStatuses: string[];
 adApprovalStatuses: string[];
 adPolicyTopics: string[];
 startDate: string | null;
 endDate: string | null;
 targetSearchNetwork: boolean | null;
 targetGoogleSearch: boolean | null;
 positiveGeoTargetType: string | null;
 negativeGeoTargetType: string | null;
 conversionGoals: Array<{ category: string | null; origin: string | null; primary: boolean | null; status: string | null }>;
 dataQuality: GoogleAdsCampaignHealthDataQuality;
};
export type GoogleAdsCampaignHealthAiReview = {
 summary: string;
 recommendationIds: string[];
};
export type GoogleAdsAccountHealthSnapshot = {
 customerId: string;
 customerStatus: string | null;
 billingStatuses: string[];
 paymentsAccountIds: string[];
 requestWarnings: string[];
 checkedAt: string;
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
export type GoogleAdsCampaignStatusSnapshot = {
 campaignId: string;
 campaignResourceName: string | null;
 status: string;
 primaryStatus: string | null;
 primaryStatusReasons: string[];
 issuesAvailable: boolean;
};
export type GoogleAdsGeoTargetSuggestion = {
 resourceName: string;
 id: string;
 name: string;
 canonicalName: string | null;
 countryCode: string | null;
 targetType: string | null;
 status: string | null;
 label: string;
};
export type GoogleAdsCampaignLocation = {
 criterionId: string;
 criterionResourceName: string | null;
 geoTargetConstant: string;
 geoTargetConstantId: string;
 name: string;
 canonicalName: string | null;
 countryCode: string | null;
 targetType: string | null;
 label: string;
 negative: boolean;
};
export type GoogleAdsCampaignLocationTargeting = {
 campaignId: string;
 targetedLocations: GoogleAdsCampaignLocation[];
 excludedLocations: GoogleAdsCampaignLocation[];
 positiveGeoTargetType: string | null;
 negativeGeoTargetType: string | null;
};
export type GoogleAdsSearchTerm = {
 campaignId: string;
 campaignName: string | null;
 adGroupId: string | null;
 adGroupName: string | null;
 term: string;
 clicks: number;
 impressions: number;
 ctr: number;
 conversions: number;
 costMicros: number;
};
export type GoogleAdsAdGroupTotal = {
 campaignId: string;
 campaignName: string | null;
 adGroupId: string;
 adGroupName: string | null;
 impressions: number;
 clicks: number;
 ctr: number;
 conversions: number;
 costMicros: number;
};
export type GoogleAdsCampaignAdGroupKeyword = {
 id: string;
 adGroupId: string;
 text: string;
 matchType: string | null;
 status: string | null;
 negative: boolean;
 cpcBidMicros: number | null;
 impressions: number;
 clicks: number;
 conversions: number;
};
export type GoogleAdsCampaignAdGroupAd = {
 id: string;
 adGroupId: string;
 status: string | null;
 finalUrls: string[];
 headlines: string[];
 descriptions: string[];
};
export type GoogleAdsCampaignAdGroupDetail = {
 campaignId: string;
 biddingStrategyType: string | null;
 adGroupId: string;
 adGroupName: string | null;
 status: string | null;
 cpcBidMicros: number;
 impressions: number;
 clicks: number;
 ctr: number;
 conversions: number;
 costMicros: number;
 keywords: GoogleAdsCampaignAdGroupKeyword[];
 ads: GoogleAdsCampaignAdGroupAd[];
};
export type GoogleAdsSearchTermReviewSnapshot = {
 generatedAt: string;
 dateFrom: string;
 dateTo: string;
 business: { industry: string | null; services: string[]; locations: string[] };
 campaign: { id: string; name: string | null; goal: string | null };
 currentNegativeKeywords: Array<{ text: string; matchType: string | null }>;
 terms: GoogleAdsSearchTerm[];
};
export type GoogleAdsSearchTermClassification = "STRONG_MATCH" | "RELEVANT" | "WATCH" | "CONSIDER_EXCLUDING";
export type GoogleAdsSearchTermReview = {
 summary: string;
 terms: Array<{ searchTerm: string; classification: GoogleAdsSearchTermClassification; confidence: "high" | "medium" | "low"; reason: string; evidence: string[]; suggestedNegativeMatchType: "EXACT" | "PHRASE" | "BROAD" | null; canApplyInServonas: boolean }>;
};

export const normalizeGoogleAdsNegativeKeyword = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export function googleAdsSearchTermReviewSnapshotHash(snapshot: GoogleAdsSearchTermReviewSnapshot) {
 const { generatedAt: _generatedAt, ...stableSnapshot } = snapshot;
 return createHash("sha256").update(JSON.stringify(stableSnapshot)).digest("hex");
}
export type GoogleAdsKeywordReviewKeyword = {
 id: string;
 text: string;
 matchType: string | null;
 status: string | null;
 primaryStatus: string | null;
 primaryStatusReasons: string[];
 negative: boolean;
 cpcBidMicros: number | null;
 bidEstimates: { status: "available" | "unavailable" | "error"; firstPageMicros?: number; topOfPageMicros?: number };
 qualityScore: number | null;
 creativeQualityScore: string | null;
 postClickQualityScore: string | null;
 searchPredictedCtr: string | null;
 adGroupId: string | null;
 adGroupName: string | null;
 finalUrls: string[];
 impressions: number;
 clicks: number;
 ctr: number;
 averageCpcMicros: number;
 conversions: number;
 costMicros: number;
};
export type GoogleAdsKeywordReviewSnapshot = {
 generatedAt: string;
 dateFrom: string;
 dateTo: string;
 performanceDataState: "early" | "sufficient";
 campaign: {
  id: string;
  name: string | null;
  biddingStrategy: string | null;
  dailyBudgetMicros: number | null;
  industry: string | null;
  locations: string[];
  impressions: number;
  clicks: number;
  conversions: number;
  costMicros: number;
  ctr: number | null;
  averageCpcMicros: number | null;
  costPerConversionMicros: number | null;
  conversionGoals: Array<{ category: string | null; origin: string | null; primary: boolean | null; status: string | null }>;
  adGroupDefaultCpcMicros: number[];
 };
 searchTerms: { available: boolean; items: GoogleAdsSearchTerm[] };
 keywords: GoogleAdsKeywordReviewKeyword[];
};
export type GoogleAdsKeywordReviewSuggestedValue = {
 type: "bid_adjustment" | "keyword_list" | "negative_keyword_list" | "match_type_change" | "budget_note" | "other";
 label: string;
 value: string | null;
};
export type GoogleAdsKeywordReview = {
 summary: string;
 performanceDataState: "early" | "sufficient";
 keywordsReviewed: number;
 recommendations: Array<{ id: string; category: "bid" | "pause_keyword" | "keep_keyword" | "add_keyword" | "match_type" | "negative_keyword" | "budget" | "conversion_tracking" | "other"; actionType: "adjust_default_bid" | "adjust_keyword_bid" | "pause_keywords" | "add_keywords" | "add_negative_keywords" | "change_match_type" | "review_only"; suggestedDirection: "increase" | "decrease" | "review" | null; priority: "high" | "medium" | "low"; title: string; explanation: string; evidence: string[]; keywordIds: string[]; suggestedValue: GoogleAdsKeywordReviewSuggestedValue | null; canApplyInServonas: boolean }>;
};

export const googleAdsBidStartingIncreasePercent = Math.min(50, Math.max(1, Number(process.env.GOOGLE_ADS_BID_STARTING_INCREASE_PERCENT ?? 25)));
export const googleAdsKeywordBidSafetyCapMicros = Math.round(Math.max(1, Number(process.env.GOOGLE_ADS_KEYWORD_BID_MAX_DOLLARS ?? 25)) * 1_000_000);
export const googleAdsSuggestedStartingBidMicros = (currentBidMicros: number) => Math.min(googleAdsKeywordBidSafetyCapMicros, Math.round(currentBidMicros * (1 + googleAdsBidStartingIncreasePercent / 100)));

export type GoogleAdsKeywordBidRecommendation = {
 keywordId: string;
 keyword: string;
 adGroupId: string;
 currentBidMicros: number;
 firstPageBidEstimateMicros: number;
 recommendedBidMicros: number;
 increasePercent: number;
 reason: string;
};

// Only Google-provided estimates can produce an actionable dollar recommendation.
export function deriveGoogleAdsKeywordBidRecommendations(snapshot: GoogleAdsKeywordReviewSnapshot, maxCpcMicros: number | null = null) {
 if (snapshot.campaign.biddingStrategy !== "MANUAL_CPC") return [] as GoogleAdsKeywordBidRecommendation[];
 return snapshot.keywords.flatMap((keyword) => {
  const firstPageBidEstimateMicros = keyword.bidEstimates.status === "available" ? keyword.bidEstimates.firstPageMicros ?? null : null;
  if (keyword.negative || keyword.status !== "ENABLED" || !keyword.adGroupId || !keyword.cpcBidMicros || !firstPageBidEstimateMicros || firstPageBidEstimateMicros <= keyword.cpcBidMicros) return [];
  const proposedBidMicros = Math.round(firstPageBidEstimateMicros * 1.1);
  const recommendedBidMicros = Math.min(proposedBidMicros, Math.round(keyword.cpcBidMicros * 1.5), maxCpcMicros ?? Number.MAX_SAFE_INTEGER);
  if (recommendedBidMicros <= keyword.cpcBidMicros) return [];
  return [{ keywordId: keyword.id, keyword: keyword.text, adGroupId: keyword.adGroupId, currentBidMicros: keyword.cpcBidMicros, firstPageBidEstimateMicros, recommendedBidMicros, increasePercent: Math.round(((recommendedBidMicros / keyword.cpcBidMicros) - 1) * 100), reason: "Google provided a first-page bid estimate above the current maximum bid." }];
 });
}

export function googleAdsKeywordReviewSnapshotHash(snapshot: GoogleAdsKeywordReviewSnapshot) {
 const { generatedAt: _generatedAt, ...stableSnapshot } = snapshot;
 return createHash("sha256").update(JSON.stringify(stableSnapshot)).digest("hex");
}

export function logGoogleAdsKeywordReviewStage(event: string, metadata: Record<string, unknown>) {
 console.info(event, metadata);
}

function keywordReviewLogMetadata(input: { businessId: string; googleCustomerId?: string | null; snapshot: GoogleAdsKeywordReviewSnapshot; snapshotHash: string; model: string; durationMs?: number; cacheStatus?: "hit" | "miss" | "bypassed" | null }) {
 const { snapshot } = input;
 const enabledKeywordCount = snapshot.keywords.filter((keyword) => keyword.status === "ENABLED").length;
 const positiveKeywordCount = snapshot.keywords.filter((keyword) => !keyword.negative).length;
 const negativeKeywordCount = snapshot.keywords.filter((keyword) => keyword.negative).length;
 const limitedKeywordCount = snapshot.keywords.filter((keyword) => keyword.primaryStatus === "LIMITED").length;
 return {
  businessId: input.businessId,
  googleCustomerId: input.googleCustomerId ?? null,
  googleCampaignId: snapshot.campaign.id,
  snapshotHash: input.snapshotHash,
  snapshotTimestamp: snapshot.generatedAt,
  keywordCount: snapshot.keywords.length,
  enabledKeywordCount,
  positiveKeywordCount,
  negativeKeywordCount,
  limitedKeywordCount,
  searchTermCount: snapshot.searchTerms.items.length,
  conversionGoalCount: snapshot.campaign.conversionGoals.length,
  campaignImpressions: snapshot.campaign.impressions,
  campaignClicks: snapshot.campaign.clicks,
  campaignConversions: snapshot.campaign.conversions,
  earlyCampaignMode: snapshot.performanceDataState === "early",
  model: input.model,
  durationMs: input.durationMs ?? null,
  cacheStatus: input.cacheStatus ?? null,
 };
}

const supportedGoogleAdsVersions = new Set(["v23", "v24", "v25"]);
const configuredGoogleAdsVersion = process.env.GOOGLE_ADS_API_VERSION?.trim() || null;
const googleAdsVersion = configuredGoogleAdsVersion && supportedGoogleAdsVersions.has(configuredGoogleAdsVersion)
 ? configuredGoogleAdsVersion
 : "v25";
const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://servonas.com").replace(/\/$/, "");
const adsApiBase = `https://googleads.googleapis.com/${googleAdsVersion}`;
const oauthBase = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const googleUserInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";
const googleAdsOauthScopes = ["https://www.googleapis.com/auth/adwords", "openid", "email", "profile"];

const credentials = () => ({
 clientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() || process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim(),
 clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() || process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim(),
 developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || null,
});

const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "service";
const stripCustomerId = (value: string) => value.replace(/\D/g, "");
const configuredGoogleAdsLoginCustomerId = () => stripCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim() || process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID?.trim() || "") || null;
const uniqueStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const stableTitle = (value: string) => value.trim().replace(/\s+/g, " ");
const formatGoogleAdsCustomerLabel = (name: string | null, id: string) => `${name?.trim() || id} - ${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
const defaultNegativeKeywords = ["jobs", "career", "salary", "diy", "plans", "used", "for sale", "wholesale", "manufacturer", "parts"];
const maxGoogleAdsHeadlines = 15;
const maxGoogleAdsDescriptions = 4;
const googleAdsRecommendedManualCpcMicros = 2_000_000;
const googleAdsCriticalManualCpcMicros = 50_000;
const googleAdsWarningManualCpcMicros = 500_000;
// Keep this in one place so delivery monitoring can be tuned without changing health rules.
export const GOOGLE_ADS_NO_IMPRESSION_GRACE_HOURS = 24;
const googleAdsKeywordReviewSufficientClicks = 20;
const normalizeKeywordText = (value: string) => value.trim().replace(/^["'[\](){}]+|["'[\](){}]+$/g, "").replace(/\s+/g, " ");
const jsonText = (value: unknown) => typeof value === "string" ? value : "";
const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const microsToCurrency = (micros: number) => moneyFormatter.format(micros / 1_000_000);
const dollarsToMicros = (dollars: number) => Math.round(dollars * 1_000_000);
const payloadFingerprint = (value: unknown) => createHash("sha1").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 12);
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
const extractGoogleAdsFailureEntries = (details: GoogleAdsErrorDetail[] | undefined) => {
 if (!Array.isArray(details)) return [];
 return details.flatMap((detail) => {
  const nestedErrors = Array.isArray(detail.errors) && detail.errors.length ? detail.errors : [detail];
  return nestedErrors.map((entry) => {
   const errorCodeKey = entry.errorCode ? Object.keys(entry.errorCode)[0] ?? null : null;
   return {
    message: entry.message ?? detail.message ?? null,
    trigger: entry.trigger ?? detail.trigger ?? null,
    errorCodeCategory: errorCodeKey ? errorCodeKey.replace(/Error$/u, "") : null,
    errorCodeKey,
    errorCodeValue: errorCodeKey && entry.errorCode ? jsonText(entry.errorCode[errorCodeKey]) || null : null,
    location: safeGoogleAdsLocation(entry.location ?? detail.location),
    requestId: typeof detail.requestId === "string" ? detail.requestId : null,
   };
  });
 });
};
const safeGoogleAdsDetails = (details: GoogleAdsErrorDetail[] | undefined) =>
 extractGoogleAdsFailureEntries(details).map((detail) => ({
  message: detail.message,
  trigger: detail.trigger,
  errorCodeCategory: detail.errorCodeCategory,
  errorCodeKey: detail.errorCodeKey,
  errorCodeValue: detail.errorCodeValue,
  location: detail.location,
  requestId: detail.requestId,
 }));
const safeGoogleAdsFailurePayload = (details: GoogleAdsErrorDetail[] | undefined) =>
 extractGoogleAdsFailureEntries(details).map((detail) => ({
  message: detail.message,
  trigger: detail.trigger,
  errorCodeCategory: detail.errorCodeCategory,
  errorCodeKey: detail.errorCodeKey,
  errorCodeValue: detail.errorCodeValue,
 location: detail.location,
 requestId: detail.requestId,
 }));
const normalizeGoogleAdsDate = (value: string) => {
 const trimmed = value.trim();
 if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
 if (/^\d{8}$/.test(trimmed)) return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
 throw new Error(`Invalid Google Ads date: ${value}`);
};
const escapeGaqlString = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const normalizeGeoTargetSearchTerm = (value: string) =>
 value
  .trim()
  .replace(/[%_*]+/g, " ")
  .replace(/[\u0000-\u001f]+/g, " ")
  .replace(/\s+/g, " ")
  .slice(0, 80);
const googleAdsCustomDateRangeFilter = (dateFrom: string, dateTo: string) =>
 `segments.date BETWEEN '${normalizeGoogleAdsDate(dateFrom)}' AND '${normalizeGoogleAdsDate(dateTo)}'`;
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
  | { campaignOperation?: { create?: { name?: unknown; advertisingChannelType?: unknown; status?: unknown; campaignBudget?: unknown; manualCpc?: unknown; campaignBiddingStrategy?: unknown; containsEuPoliticalAdvertising?: unknown; networkSettings?: Record<string, unknown> } } }
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
   biddingStrategyType: campaignCreate?.campaignOperation?.create?.manualCpc ? "MANUAL_CPC" : campaignCreate?.campaignOperation?.create?.campaignBiddingStrategy ? "CUSTOM" : null,
   hasManualCpc: Boolean(campaignCreate?.campaignOperation?.create?.manualCpc),
   campaignBiddingStrategy: campaignCreate?.campaignOperation?.create?.campaignBiddingStrategy ?? null,
   containsEuPoliticalAdvertising: typeof campaignCreate?.campaignOperation?.create?.containsEuPoliticalAdvertising === "string" ? campaignCreate.campaignOperation.create.containsEuPoliticalAdvertising : null,
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
const logGoogleAdsSupabaseWriteError = (input: {
 stage: string;
 businessId: string;
 businessSlug?: string | null;
 table: string;
 operation: "insert" | "update" | "upsert";
 error: { status?: number; code?: string; message?: string; details?: string; hint?: string } | null;
}) => {
 if (!input.error) return;
 logGoogleAdsErrorDiagnostic("Google Ads Supabase write failed", {
  stage: input.stage,
  provider: "supabase",
  businessId: input.businessId,
  businessSlug: input.businessSlug ?? null,
  table: input.table,
  operation: input.operation,
  httpStatus: input.error.status ?? null,
  supabaseCode: input.error.code ?? null,
  supabaseMessage: input.error.message ?? null,
  supabaseDetails: input.error.details ?? null,
  supabaseHint: input.error.hint ?? null,
 });
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
 retryAfterSeconds: number | null;
 requestId: string | null;

 constructor(input: {
  message: string;
  status: number;
  googleStatus?: string | null;
  details?: GoogleAdsErrorDetail[];
  loginCustomerId?: string | null;
  targetCustomerId?: string | null;
  retryAfterSeconds?: number | null;
  requestId?: string | null;
 }) {
  super(input.message);
  this.name = "GoogleAdsRequestError";
  this.status = input.status;
  this.googleStatus = input.googleStatus ?? null;
  this.details = input.details ?? [];
  this.loginCustomerId = input.loginCustomerId ?? null;
  this.targetCustomerId = input.targetCustomerId ?? null;
  this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  this.requestId = input.requestId ?? null;
 }
}
const limitGoogleAdsTextAssets = (values: string[], max: number) => uniqueStrings(values).slice(0, max);
const normalizeGoogleAdsKeywords = (values: string[]) =>
 uniqueStrings(values.map(normalizeKeywordText).filter(Boolean));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const parseRetryAfterSeconds = (value: string | null) => {
 if (!value) return null;
 const trimmed = value.trim();
 const numeric = Number(trimmed);
 if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
 const date = Date.parse(trimmed);
 return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
};
const isoAfterSeconds = (seconds: number | null) => seconds != null ? new Date(Date.now() + seconds * 1000).toISOString() : null;
const googleAdsRequestId = (response: Response, details: GoogleAdsErrorDetail[] | undefined) =>
 response.headers.get("request-id")
 || response.headers.get("x-request-id")
 || (typeof details?.[0]?.requestId === "string" ? details[0].requestId : null);

function safeNumber(value: unknown) {
 const numeric = Number(value);
 return Number.isFinite(numeric) ? numeric : 0;
}

function safeStringArray(value: unknown) {
 if (!Array.isArray(value)) return [];
 return value.map((entry) => typeof entry === "string" ? entry : "").filter(Boolean);
}

function readGoogleAdsField<T>(record: Record<string, unknown> | undefined, camelKey: string, snakeKey: string) {
 if (!record) return undefined;
 const readPath = (key: string): unknown => {
  if (record[key] !== undefined) return record[key];
  return key.split(".").reduce<unknown>((value, segment) => value && typeof value === "object" ? (value as Record<string, unknown>)[segment] : undefined, record);
 };
 return (readPath(camelKey) ?? readPath(snakeKey)) as T | undefined;
}

function geoTargetIdFromResourceName(value: string | null | undefined) {
 if (!value) return null;
 const id = value.split("/").pop()?.trim() ?? "";
 return id || null;
}

function formatGeoTargetLabel(input: {
 name: string | null;
 canonicalName?: string | null;
 countryCode?: string | null;
 targetType?: string | null;
}) {
 const canonical = input.canonicalName?.trim() || null;
 const name = input.name?.trim() || null;
 const base = canonical || name || "Unknown location";
 const suffix = input.targetType?.trim()
  ? ` — ${input.targetType.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}`
  : "";
 return `${base}${suffix}`;
}

function scoreGeoTargetSuggestion(result: GoogleAdsGeoTargetSuggestion, term: string) {
 const normalizedTerm = term.toLowerCase();
 const name = result.name.toLowerCase();
 const canonical = (result.canonicalName ?? "").toLowerCase();
 if (name === normalizedTerm) return 0;
 if (canonical === normalizedTerm) return 1;
 if (name.startsWith(normalizedTerm)) return 2;
 if (canonical.startsWith(normalizedTerm)) return 3;
 if (name.includes(normalizedTerm)) return 4;
 if (canonical.includes(normalizedTerm)) return 5;
 return 6;
}

function extractGoogleAdsErrorPayload(value: unknown): GoogleAdsErrorResponse["error"] | null {
 if (!value || typeof value !== "object") return null;
 if (Array.isArray(value)) {
  for (const entry of value) {
   if (entry && typeof entry === "object" && "error" in entry) {
    return ((entry as { error?: GoogleAdsErrorResponse["error"] }).error ?? null) as GoogleAdsErrorResponse["error"] | null;
   }
  }
  return null;
 }
 return "error" in value ? (((value as { error?: GoogleAdsErrorResponse["error"] }).error) ?? null) : null;
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

function parseJwtPayload(token: string) {
 const [, payload] = token.split(".");
 if (!payload) return null;
 try {
  const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const parsed = JSON.parse(json) as { email?: unknown; name?: unknown };
  return {
   email: typeof parsed.email === "string" ? parsed.email.trim() || null : null,
   name: typeof parsed.name === "string" ? parsed.name.trim() || null : null,
  } satisfies GoogleAdsConnectionIdentity;
 } catch {
  return null;
 }
}

async function fetchGoogleAdsAuthenticatedIdentity(accessToken: string, idToken?: string | null, context: { businessId?: string | null; businessSlug?: string | null } = {}) {
 const startedAt = now();
 const claims = idToken ? parseJwtPayload(idToken) : null;
 if (claims?.email || claims?.name) {
  logGoogleAdsDiagnostic("Google Ads OAuth identity resolved from ID token", {
   stage: "google_ads_identity_lookup",
   provider: "google_oauth",
   businessId: context.businessId ?? null,
   businessSlug: context.businessSlug ?? null,
   identitySource: "id_token",
   hasEmail: Boolean(claims.email),
   hasName: Boolean(claims.name),
  });
  return claims;
 }
 try {
  const response = await fetch(googleUserInfoEndpoint, {
   headers: { Authorization: `Bearer ${accessToken}` },
   cache: "no-store",
  });
  const result = await response.json() as GoogleUserInfoResponse & { error?: string; error_description?: string };
  if (!response.ok) {
   logGoogleAdsErrorDiagnostic("Google Ads OAuth identity lookup failed", {
    stage: "google_ads_identity_lookup",
    provider: "google_oauth",
    businessId: context.businessId ?? null,
    businessSlug: context.businessSlug ?? null,
    httpStatus: response.status,
    durationMs: durationMs(startedAt),
    googleError: result.error ?? null,
    googleErrorDescription: result.error_description ?? null,
    identitySource: "userinfo",
   });
   return { email: null, name: null };
  }
  logGoogleAdsDiagnostic("Google Ads OAuth identity lookup completed", {
   stage: "google_ads_identity_lookup",
   provider: "google_oauth",
   businessId: context.businessId ?? null,
   businessSlug: context.businessSlug ?? null,
   httpStatus: response.status,
   durationMs: durationMs(startedAt),
   identitySource: "userinfo",
   hasEmail: Boolean(result.email),
   hasName: Boolean(result.name),
  });
  return {
   email: result.email?.trim() || null,
   name: result.name?.trim() || null,
  };
 } catch (error) {
  logGoogleAdsErrorDiagnostic("Google Ads OAuth identity lookup failed", {
   stage: "google_ads_identity_lookup",
   provider: "google_oauth",
   businessId: context.businessId ?? null,
   businessSlug: context.businessSlug ?? null,
   error: error instanceof Error ? error.message : "unknown",
   durationMs: durationMs(startedAt),
   identitySource: "userinfo",
  });
  return { email: null, name: null };
 }
}

type GoogleAdsRequestInput = {
 accessToken: string;
 method?: string;
 customerId?: string | null;
 loginCustomerId?: string | null;
 body?: unknown;
 suppressFailureDiagnostics?: boolean;
 publishAttempt?: number | null;
 mutationAttempt?: number | null;
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
 const attemptedPayloads = new Set<string>();
 const maxPhaseAttempts = 3;
 let phaseAttempt = 0;
 for (const phase of phases) {
  if (phaseAttempt >= maxPhaseAttempts) break;
  const summary = summarizeMutateBody({ mutateOperations: phase.operations });
  const fingerprint = payloadFingerprint(summary);
  if (attemptedPayloads.has(fingerprint)) continue;
  attemptedPayloads.add(fingerprint);
  phaseAttempt += 1;
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
    suppressFailureDiagnostics: true,
    publishAttempt: input.publishAttempt ?? 1,
    mutationAttempt: phaseAttempt,
   });
   logGoogleAdsDiagnostic("Google Ads mutate phase validation completed", {
    stage: "google_ads_mutate_phase_validation",
    provider: "google_ads_api",
    phase: phase.name,
    publishAttempt: input.publishAttempt ?? 1,
    mutationAttempt: phaseAttempt,
    operationCount: phase.operations.length,
    operationTypes: phase.operations.map(mutateOperationType),
    payloadFingerprint: fingerprint,
    durationMs: durationMs(startedAt),
    customerId: input.targetCustomerId ?? input.customerId ?? null,
    loginCustomerId: input.loginCustomerId ?? null,
    requestSummary: stableJson(summary),
    result: "ok",
   });
  } catch (error) {
   const requestError = error instanceof GoogleAdsRequestError ? error : null;
   logGoogleAdsErrorDiagnostic("Google Ads mutate phase validation failed", {
     stage: "google_ads_mutate_phase_validation",
     provider: "google_ads_api",
     phase: phase.name,
     publishAttempt: input.publishAttempt ?? 1,
     mutationAttempt: phaseAttempt,
     operationCount: phase.operations.length,
     operationTypes: phase.operations.map(mutateOperationType),
     payloadFingerprint: fingerprint,
     durationMs: durationMs(startedAt),
     customerId: input.targetCustomerId ?? input.customerId ?? null,
     loginCustomerId: input.loginCustomerId ?? null,
     requestSummary: stableJson(summary),
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
  const managerId = error.loginCustomerId?.trim() || null;
  const advertiserId = error.targetCustomerId?.trim() || null;
  if (managerId && advertiserId && managerId !== advertiserId) {
   return `Google Ads denied this publish request. Manager account ${managerId} does not currently have permission to manage advertiser ${advertiserId}. Confirm the manager link is active in Google Ads, verify the connected Google user has access to the manager account, then reconnect and try again.`;
  }
  const detail = error.details[0];
  const detailCode = detail?.errorCode ? Object.keys(detail.errorCode)[0] : "";
  if (/USER_PERMISSION_DENIED|ACTION_NOT_PERMITTED/i.test(`${error.googleStatus ?? ""} ${detailCode} ${error.message}`)) {
   return "Google Ads denied this publish request. Make sure the connected Google user has admin or standard access to the selected Google Ads account, then reconnect and try again.";
  }
  return "Google Ads denied this publish request. Reconnect the correct Google Ads account or confirm the connected Google user has permission to manage it.";
 }
 if (error instanceof GoogleAdsRequestError && error.status === 400 && error.googleStatus === "INVALID_ARGUMENT") {
  const detail = safeGoogleAdsFailurePayload(error.details)[0];
  const fieldPath = detail?.location?.fieldPathElements?.map((entry) => entry.fieldName).filter(Boolean).join(".") || null;
  const detailCode = [detail?.errorCodeCategory, detail?.errorCodeValue].filter(Boolean).join(".");
  if (detail?.message) {
   return fieldPath
    ? `Google Ads rejected this campaign setup: ${detail.message} (${fieldPath}).`
    : `Google Ads rejected this campaign setup: ${detail.message}${detailCode ? ` (${detailCode})` : ""}.`;
  }
 }
 return error.message;
}

export function googleAdsPreferredLoginCustomerIds(values: Array<string | null | undefined>) {
 const next: string[] = [];
 for (const value of values) {
  if (!value) continue;
  const normalized = stripCustomerId(value);
  if (normalized && !next.includes(normalized)) next.push(normalized);
 }
 return next;
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
 const loginCustomerId = input.loginCustomerId === undefined ? null : input.loginCustomerId;
 if (loginCustomerId) headers["login-customer-id"] = stripCustomerId(loginCustomerId);
 const requestSummary = summarizeMutateBody(input.body);
 const requestFingerprint = payloadFingerprint(requestSummary);
 logGoogleAdsDiagnostic("Google Ads API request started", {
  stage: "google_ads_api_request",
  provider: "google_ads_api",
  endpointHost: "googleads.googleapis.com",
  endpointPath: path,
  method: input.method || "POST",
  publishAttempt: input.publishAttempt ?? null,
  mutationAttempt: input.mutationAttempt ?? null,
  operationCount: requestSummary?.operationCount ?? null,
  operationTypes: requestSummary?.operationTypes ?? [],
  payloadFingerprint: requestFingerprint,
  customerId: targetCustomerId,
  loginCustomerId,
  requestSummary: stableJson(requestSummary),
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
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
  const requestId = googleAdsRequestId(response, result.error?.details);
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
   publishAttempt: input.publishAttempt ?? null,
   mutationAttempt: input.mutationAttempt ?? null,
   operationCount: requestSummary?.operationCount ?? null,
   operationTypes: requestSummary?.operationTypes ?? [],
   payloadFingerprint: requestFingerprint,
   durationMs: durationMs(startedAt),
   loginCustomerId,
   targetCustomerId: input.customerId ?? null,
   googleErrorCode: result.error?.code ?? null,
   googleStatus: result.error?.status ?? null,
   googleMessage: result.error?.message ?? null,
   requestId,
   retryAfterSeconds,
   retryAfterAt: isoAfterSeconds(retryAfterSeconds),
   googleDetails: stableJson(sanitizedResult?.details ?? []),
   googleFailureDetails: stableJson(safeGoogleAdsFailurePayload(result.error?.details)),
   requestSummary: stableJson(requestSummary),
   responseBody: stableJson(sanitizedResult),
  });
  if (!input.suppressFailureDiagnostics && response.status === 400 && path.includes("/googleAds:mutate")) {
   await logGoogleAdsMutatePhaseDiagnostics(path, {
    accessToken: input.accessToken,
    method: input.method,
    customerId: input.customerId ?? null,
    targetCustomerId: input.customerId ?? null,
    loginCustomerId,
    body: input.body,
    suppressFailureDiagnostics: true,
    publishAttempt: input.publishAttempt ?? 1,
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
   retryAfterSeconds,
   requestId,
  });
 }
 logGoogleAdsDiagnostic("Google Ads API request completed", {
  stage: "google_ads_api_request",
  provider: "google_ads_api",
  endpointHost: "googleads.googleapis.com",
  endpointPath: path,
  method: input.method || "POST",
  publishAttempt: input.publishAttempt ?? null,
  mutationAttempt: input.mutationAttempt ?? null,
  operationCount: requestSummary?.operationCount ?? null,
  operationTypes: requestSummary?.operationTypes ?? [],
  payloadFingerprint: requestFingerprint,
  httpStatus: response.status,
  durationMs: durationMs(startedAt),
  customerId: targetCustomerId,
  loginCustomerId,
 });
 Object.defineProperty(result, "__servonasGoogleAdsRequest", { value: { requestId: googleAdsRequestId(response, undefined), durationMs: durationMs(startedAt), httpStatus: response.status }, enumerable: false });
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
 const preferredLoginCustomerId = attempts.find((value) => value !== null) ?? null;
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
   if (status === 403 && loginCustomerId && loginCustomerId === preferredLoginCustomerId) throw current;
   if (!googleAdsPermissionDenied(current.message, status) || loginCustomerId === attempts.at(-1)) throw current;
  }
 }
 throw lastError ?? new Error("Google Ads request failed.");
}

async function googleAdsSearchStream(
 customerId: string,
 accessToken: string,
 query: string,
 loginCustomerId?: string | null,
 context: { stage: string; requestType: string; businessId?: string | null } = { stage: "google_ads_search_stream", requestType: "google_ads_search_stream" },
) {
 const { developerToken } = credentials();
 if (!developerToken) throw new Error("Google Ads developer token is not configured.");
 const normalizedLoginCustomerId = loginCustomerId?.trim() ? stripCustomerId(loginCustomerId) : null;
 const endpointPath = `/customers/${stripCustomerId(customerId)}/googleAds:searchStream`;
 const startedAt = now();
 logGoogleAdsDiagnostic("Google Ads API request started", {
  stage: context.stage,
  provider: "google_ads_api",
  endpointHost: "googleads.googleapis.com",
  endpointPath,
  method: "POST",
  targetCustomerId: customerId,
  loginCustomerId: normalizedLoginCustomerId,
  requestType: context.requestType,
  businessId: context.businessId ?? null,
  gaql: query,
 });
 const response = await fetch(`${adsApiBase}${endpointPath}`, {
  method: "POST",
  headers: {
   Authorization: `Bearer ${accessToken}`,
   "developer-token": developerToken,
   ...(normalizedLoginCustomerId ? { "login-customer-id": normalizedLoginCustomerId } : {}),
   "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
  cache: "no-store",
 });
 const text = await response.text();
 let parsed: unknown = [];
 try {
  parsed = text ? JSON.parse(text) : [];
 } catch {
  throw new Error(`Google Ads returned an invalid report response (${response.status}).`);
 }
 const chunks = Array.isArray(parsed) ? parsed as GoogleAdsSearchStreamChunk[] : [];
 const errorPayload = extractGoogleAdsErrorPayload(parsed);
 if (!response.ok) {
  const details = errorPayload?.details ?? [];
  const requestId = googleAdsRequestId(response, details);
  logGoogleAdsErrorDiagnostic("Google Ads API request failed", {
   stage: context.stage,
   provider: "google_ads_api",
   endpointHost: "googleads.googleapis.com",
   endpointPath,
   httpStatus: response.status,
   method: "POST",
   targetCustomerId: customerId,
   loginCustomerId: normalizedLoginCustomerId,
   requestType: context.requestType,
   businessId: context.businessId ?? null,
   gaql: query,
   googleStatus: errorPayload?.status ?? null,
   googleMessage: errorPayload?.message ?? chunks[0]?.error?.message ?? null,
   googleDetails: safeGoogleAdsDetails(details),
   requestId,
   durationMs: durationMs(startedAt),
  });
  throw new GoogleAdsRequestError({
   message: errorPayload?.message ?? chunks[0]?.error?.message ?? `Google Ads report request failed (${response.status}).`,
   status: response.status,
   googleStatus: errorPayload?.status ?? null,
   details,
   loginCustomerId: normalizedLoginCustomerId,
   targetCustomerId: customerId,
   requestId,
  });
 }
 logGoogleAdsDiagnostic("Google Ads API request completed", {
  stage: context.stage,
  provider: "google_ads_api",
  endpointHost: "googleads.googleapis.com",
  endpointPath,
  httpStatus: response.status,
  method: "POST",
  targetCustomerId: customerId,
  loginCustomerId: normalizedLoginCustomerId,
  requestType: context.requestType,
  businessId: context.businessId ?? null,
  gaql: query,
  resultCount: chunks.flatMap((chunk) => chunk.results ?? []).length,
  durationMs: durationMs(startedAt),
 });
 return chunks.flatMap((chunk) => chunk.results ?? []);
}

async function accessibleCustomers(accessToken: string): Promise<GoogleAdsCustomer[]> {
 const list = await googleAdsRequest<GoogleAdsListResponse>("/customers:listAccessibleCustomers", {
  accessToken,
  method: "GET",
 });
 const ids = uniqueStrings((list.resourceNames ?? []).map((name) => name.split("/").pop() ?? ""));
 logGoogleAdsDiagnostic("Google Ads accessible customers discovered", {
  stage: "google_ads_account_discovery",
  provider: "google_ads_api",
  endpointPath: "/customers:listAccessibleCustomers",
  resourceNames: list.resourceNames ?? [],
  customerIds: ids,
  customerCount: ids.length,
 });
 return ids.map((id) => ({
  id,
  label: formatGoogleAdsCustomerLabel(null, id),
  loginCustomerId: null,
  managerCustomerId: null,
  isManager: false,
  level: 0,
  status: null,
  source: "direct",
 }));
}

function isRetryableGoogleAdsReadError(error: unknown) {
 return error instanceof GoogleAdsRequestError && error.status === 429 && error.googleStatus === "RESOURCE_EXHAUSTED";
}

async function accessibleCustomersWithBackoff(accessToken: string, options: { maxAttempts?: number } = {}): Promise<GoogleAdsCustomer[]> {
 const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
 let attempt = 0;
 let delayMs = 1000;
 let lastError: unknown = null;
 while (attempt < maxAttempts) {
  try {
   return await accessibleCustomers(accessToken);
  } catch (error) {
   lastError = error;
   attempt += 1;
   if (!isRetryableGoogleAdsReadError(error) || attempt >= maxAttempts) throw error;
   const retryAfterSeconds = (error as GoogleAdsRequestError).retryAfterSeconds;
   if (retryAfterSeconds != null && retryAfterSeconds > 0) throw error;
   await sleep(delayMs);
   delayMs *= 2;
  }
 }
 throw lastError instanceof Error ? lastError : new Error("Google Ads accessible customer lookup failed.");
}

export async function persistGoogleAdsOauthConnection(input: {
 businessId: string;
 businessSlug?: string | null;
 userId: string;
 refreshToken: string;
 authenticatedIdentity?: GoogleAdsConnectionIdentity | null;
 status?: GoogleAdsConnectionStatus;
}) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads connection storage is unavailable.");
 const nowIso = new Date().toISOString();
 logGoogleAdsDiagnostic("Google Ads connection persist started", {
  stage: "google_ads_connection_persist_start",
  provider: "supabase",
  businessId: input.businessId,
  businessSlug: input.businessSlug ?? null,
  connectionStatus: input.status ?? "oauth_connected",
 });
 const { error } = await db.from("business_google_ads_connections").upsert({
  business_id: input.businessId,
  connected_by: input.userId,
  refresh_token: input.refreshToken,
  google_authenticated_email: input.authenticatedIdentity?.email ?? null,
  google_authenticated_name: input.authenticatedIdentity?.name ?? null,
  status: input.status ?? "oauth_connected",
  updated_at: nowIso,
  connected_at: nowIso,
 }, { onConflict: "business_id" });
 if (error) {
  logGoogleAdsSupabaseWriteError({
   stage: "google_ads_connection_persist_failed",
   businessId: input.businessId,
   businessSlug: input.businessSlug ?? null,
   table: "business_google_ads_connections",
   operation: "upsert",
   error,
  });
  throw new Error("Google Ads connection could not be saved. Apply the Google Ads connection schema migration.");
 }
 logGoogleAdsDiagnostic("Google Ads connection persist completed", {
  stage: "google_ads_connection_persist_complete",
  provider: "supabase",
  businessId: input.businessId,
  businessSlug: input.businessSlug ?? null,
  connectionStatus: input.status ?? "oauth_connected",
  selectedCustomerId: null,
 });
}

async function validateSelectedGoogleAdsCustomerDirect(input: {
 accessToken: string;
 customerId: string;
 businessId: string;
 businessSlug?: string | null;
}) {
 const startedAt = now();
 logGoogleAdsDiagnostic("Google Ads direct validation started", {
  stage: "google_ads_direct_validation_start",
  provider: "google_ads_api",
  businessId: input.businessId,
  businessSlug: input.businessSlug ?? null,
  selectedCustomerId: input.customerId,
  directValidationAttempted: true,
 });
 try {
  const result = await googleAdsSearch(
   input.customerId,
   input.accessToken,
   "SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1",
   null,
  );
  logGoogleAdsDiagnostic("Google Ads selected customer direct validation completed", {
   stage: "google_ads_direct_validation_complete",
   provider: "google_ads_api",
   businessId: input.businessId,
   businessSlug: input.businessSlug ?? null,
   selectedCustomerId: input.customerId,
   loginCustomerId: null,
   httpStatus: 200,
   durationMs: durationMs(startedAt),
   resultCount: Array.isArray(result.results) ? result.results.length : 0,
   directValidationAttempted: true,
  });
  return true;
 } catch (error) {
  const requestError = error instanceof GoogleAdsRequestError ? error : null;
  logGoogleAdsErrorDiagnostic("Google Ads selected customer direct validation failed", {
   stage: "google_ads_direct_validation_complete",
   provider: "google_ads_api",
   businessId: input.businessId,
   businessSlug: input.businessSlug ?? null,
   selectedCustomerId: input.customerId,
   loginCustomerId: null,
   httpStatus: requestError?.status ?? null,
   googleStatus: requestError?.googleStatus ?? null,
   googleMessage: error instanceof Error ? error.message : "Unknown error",
   requestId: requestError?.requestId ?? null,
   durationMs: durationMs(startedAt),
   directValidationAttempted: true,
  });
  return false;
 }
}

export async function discoverGoogleAdsAccounts(input: {
 businessId: string;
 businessSlug?: string | null;
 userId?: string | null;
 accessToken?: string;
 authenticatedEmail?: string | null;
 authenticatedName?: string | null;
 force?: boolean;
 maxAttempts?: number;
}): Promise<GoogleAdsDiscoveryResult> {
  const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads access is unavailable.");
 const { data: connection } = await db.from("business_google_ads_connections")
 .select("connected_by,refresh_token,google_ads_customer_id,status,account_discovery_retry_after_at,google_authenticated_email,google_authenticated_name")
  .eq("business_id", input.businessId)
  .maybeSingle();
 if (!connection?.refresh_token && !input.accessToken) throw new Error("Reconnect Google Ads before refreshing accounts.");
 const selectedCustomerId = typeof connection?.google_ads_customer_id === "string" ? connection.google_ads_customer_id : null;
 const retryAfterAt = typeof connection?.account_discovery_retry_after_at === "string" ? connection.account_discovery_retry_after_at : null;
 if (!input.force && retryAfterAt && new Date(retryAfterAt).getTime() > Date.now()) {
  logGoogleAdsDiagnostic("Google Ads account discovery skipped", {
   stage: "google_ads_account_discovery_skipped",
   provider: "google_ads_api",
   businessId: input.businessId,
   businessSlug: input.businessSlug ?? null,
   selectedCustomerId,
   connectionStatus: selectedCustomerId ? "account_selected" : "account_discovery_rate_limited",
   discoveryAttempted: false,
   directValidationAttempted: false,
   reason: "cached_discovery_valid",
   retryAfterAt,
  });
  return {
   ok: false,
   rateLimited: true,
   retryAfterAt,
   customers: [],
   rootCustomers: [],
   selectedCustomerPreserved: Boolean(selectedCustomerId),
   selectedCustomerDirectAccessVerified: false,
   selectedCustomerId,
   status: selectedCustomerId ? "account_selected" : "account_discovery_rate_limited",
   userMessage: selectedCustomerId
    ? "Google Ads is connected. Account list refresh is temporarily limited by Google, but the selected account is still available."
    : "Google Ads connected, but Google temporarily limited account lookup. Try Refresh accounts later.",
   requestId: null,
   googleStatus: "RESOURCE_EXHAUSTED",
   googleMessage: "Google account discovery is temporarily rate limited.",
  };
 }
 const accessToken = input.accessToken ?? await refreshGoogleAdsAccessToken(connection!.refresh_token, { businessId: input.businessId });
 const nowIso = new Date().toISOString();
 logGoogleAdsDiagnostic("Google Ads account discovery started", {
  stage: "google_ads_account_discovery_start",
  provider: "google_ads_api",
  businessId: input.businessId,
  businessSlug: input.businessSlug ?? null,
  selectedCustomerId,
  connectionStatus: connection?.status ?? "oauth_connected",
  discoveryAttempted: true,
  directValidationAttempted: false,
  force: Boolean(input.force),
 });
 try {
  const rootCustomers = await accessibleCustomersWithBackoff(accessToken, { maxAttempts: input.maxAttempts ?? 2 });
  const hydratedRootCustomers = await Promise.all(rootCustomers.map((customer) => googleAdsCustomerSummary(customer.id, accessToken)));
  const hierarchyByManager = Object.fromEntries(await Promise.all(
   hydratedRootCustomers.filter((customer) => customer.isManager).map(async (customer) => [customer.id, await googleAdsManagerHierarchy(customer.id, accessToken)] as const),
  ));
  const { selectableCustomers } = mergeGoogleAdsSelectableCustomers(hydratedRootCustomers, hierarchyByManager);
  await storeGoogleAdsConnection({
   businessId: input.businessId,
   userId: input.userId ?? connection?.connected_by ?? "",
   refreshToken: connection?.refresh_token ?? "",
   customers: selectableCustomers,
   rootCustomers: hydratedRootCustomers,
   selectedCustomerId,
   authenticatedIdentity: { email: input.authenticatedEmail ?? connection?.google_authenticated_email ?? null, name: input.authenticatedName ?? connection?.google_authenticated_name ?? null },
  });
  const result: GoogleAdsDiscoveryResult = {
   ok: true,
   rateLimited: false,
   retryAfterAt: null,
   customers: selectableCustomers,
   rootCustomers: hydratedRootCustomers,
   selectedCustomerPreserved: Boolean(selectedCustomerId && selectableCustomers.some((customer) => customer.id === selectedCustomerId)),
   selectedCustomerDirectAccessVerified: false,
   selectedCustomerId,
   status: selectedCustomerId
    ? (selectableCustomers.some((customer) => customer.id === selectedCustomerId) ? "account_selected" : "account_discovery_pending")
    : (selectableCustomers.length === 1 ? "account_selected" : "account_discovery_pending"),
   userMessage: selectableCustomers.length === 1
    ? `Google Ads connected. Account ${selectableCustomers[0].label} is ready.`
    : "Google Ads connected. Select which Google Ads account this business should use.",
   requestId: null,
   googleStatus: null,
   googleMessage: null,
  };
  logGoogleAdsDiagnostic("Google Ads account discovery completed", {
   stage: "google_ads_account_discovery_complete",
   provider: "google_ads_api",
   businessId: input.businessId,
   businessSlug: input.businessSlug ?? null,
   selectedCustomerId,
   connectionStatus: result.status,
   discoveryAttempted: true,
   directValidationAttempted: false,
   customerCount: result.customers.length,
   rootCustomerCount: result.rootCustomers.length,
   rateLimited: false,
  });
  return result;
 } catch (error) {
  if (isRetryableGoogleAdsReadError(error)) {
   const requestError = error as GoogleAdsRequestError;
   const retryAfter = requestError.retryAfterSeconds ?? 300;
   const nextRetryAt = isoAfterSeconds(retryAfter);
   const selectedCustomerDirectAccessVerified = selectedCustomerId
    ? await validateSelectedGoogleAdsCustomerDirect({
      accessToken,
      customerId: selectedCustomerId,
      businessId: input.businessId,
      businessSlug: input.businessSlug ?? null,
     })
    : false;
   const nextStatus: GoogleAdsConnectionStatus = selectedCustomerDirectAccessVerified
    ? "account_access_verified"
    : selectedCustomerId
     ? "account_selected"
     : "account_discovery_rate_limited";
   logGoogleAdsErrorDiagnostic("Google Ads account discovery rate limited", {
    stage: "google_ads_account_discovery",
    provider: "google_ads_api",
    businessId: input.businessId,
    businessSlug: input.businessSlug ?? null,
    endpoint: "/customers:listAccessibleCustomers",
    authenticatedGoogleEmail: input.authenticatedEmail ?? connection?.google_authenticated_email ?? null,
    httpStatus: requestError.status,
    googleStatus: requestError.googleStatus,
    message: requestError.message,
    requestId: requestError.requestId,
    retryAfterSeconds: requestError.retryAfterSeconds,
    retryAfterAt: nextRetryAt,
   });
   await db.from("business_google_ads_connections").update({
    status: nextStatus,
    account_discovery_last_attempted_at: nowIso,
    account_discovery_retry_after_at: nextRetryAt,
    account_discovery_last_http_status: requestError.status,
    account_discovery_last_google_status: requestError.googleStatus,
    account_discovery_last_message: requestError.message,
    account_discovery_last_request_id: requestError.requestId,
    updated_at: nowIso,
   }).eq("business_id", input.businessId);
   const result: GoogleAdsDiscoveryResult = {
    ok: false,
    rateLimited: true,
    retryAfterAt: nextRetryAt,
    customers: [],
    rootCustomers: [],
    selectedCustomerPreserved: Boolean(selectedCustomerId),
    selectedCustomerDirectAccessVerified,
    selectedCustomerId,
    status: nextStatus,
    userMessage: selectedCustomerDirectAccessVerified
     ? "Google Ads is connected. Account list refresh is temporarily limited by Google, but the selected account is still accessible."
     : selectedCustomerId
      ? "Google Ads is connected. Account list refresh is temporarily limited by Google, and the selected account could not be revalidated yet."
      : "Google Ads connected, but Google temporarily limited account lookup. Try Refresh accounts later.",
    requestId: requestError.requestId,
    googleStatus: requestError.googleStatus,
    googleMessage: requestError.message,
   };
   logGoogleAdsDiagnostic("Google Ads account discovery completed", {
    stage: "google_ads_account_discovery_complete",
    provider: "google_ads_api",
    businessId: input.businessId,
    businessSlug: input.businessSlug ?? null,
    selectedCustomerId,
    connectionStatus: result.status,
    discoveryAttempted: true,
    directValidationAttempted: Boolean(selectedCustomerId),
    customerCount: 0,
    rootCustomerCount: 0,
    rateLimited: true,
    requestId: requestError.requestId,
    googleStatus: requestError.googleStatus,
   });
   return result;
  }
  throw error;
 }
}

function parseGoogleAdsCustomerRow(row: Record<string, unknown> | undefined, fallbackId: string): GoogleAdsCustomer {
 const customer = ((row as GoogleAdsCustomerRow | undefined)?.customer ?? {}) as GoogleAdsCustomerRow["customer"];
 const id = stripCustomerId(String(customer?.id ?? fallbackId));
 const descriptiveName = typeof customer?.descriptiveName === "string" ? customer.descriptiveName : null;
 return {
  id,
  label: formatGoogleAdsCustomerLabel(descriptiveName, id),
  loginCustomerId: null,
  managerCustomerId: null,
  isManager: Boolean(customer?.manager),
  level: 0,
  status: null,
  source: "direct",
 };
}

function parseGoogleAdsCustomerClientRow(row: Record<string, unknown>): GoogleAdsCustomer | null {
 const customerClient = ((row as GoogleAdsCustomerClientRow).customerClient ?? {}) as GoogleAdsCustomerClientRow["customerClient"];
 const id = stripCustomerId(String(customerClient?.id ?? ""));
 if (!id) return null;
 const descriptiveName = typeof customerClient?.descriptiveName === "string" ? customerClient.descriptiveName : null;
 const level = Number(customerClient?.level);
 return {
  id,
  label: formatGoogleAdsCustomerLabel(descriptiveName, id),
  loginCustomerId: null,
  managerCustomerId: null,
  isManager: Boolean(customerClient?.manager),
  level: Number.isFinite(level) ? level : null,
  status: typeof customerClient?.status === "string" ? customerClient.status : null,
  source: "manager_hierarchy",
 };
}

function selectableAdvertiser(customer: GoogleAdsCustomer) {
 return !customer.isManager && customer.status !== "REMOVED" && customer.status !== "CANCELED";
}

export function mergeGoogleAdsSelectableCustomers(
 rootCustomers: GoogleAdsCustomer[],
 hierarchyByManager: Record<string, GoogleAdsCustomer[]>,
) {
 const discoveredManagerAccounts = rootCustomers.filter((customer) => customer.isManager);
 const selectableCustomers = new Map<string, GoogleAdsCustomer>();
 for (const rootCustomer of rootCustomers) {
  if (rootCustomer.isManager) {
   for (const child of hierarchyByManager[rootCustomer.id] ?? []) {
    if (!selectableAdvertiser(child)) continue;
    const next = {
     ...child,
     loginCustomerId: rootCustomer.id,
     managerCustomerId: rootCustomer.id,
     source: "manager_hierarchy" as const,
    };
    if (!selectableCustomers.has(next.id)) selectableCustomers.set(next.id, next);
   }
   continue;
  }
  if (!selectableAdvertiser(rootCustomer)) continue;
  selectableCustomers.set(rootCustomer.id, {
   ...rootCustomer,
   loginCustomerId: null,
   managerCustomerId: null,
   source: "direct",
  });
 }
 return {
  discoveredManagerAccounts,
  selectableCustomers: [...selectableCustomers.values()].sort((a, b) => a.label.localeCompare(b.label)),
 };
}

async function googleAdsCustomerSummary(customerId: string, accessToken: string) {
 const result = await googleAdsSearch(customerId, accessToken, "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account FROM customer LIMIT 1");
 return parseGoogleAdsCustomerRow(result.results?.[0], customerId);
}

async function googleAdsManagerHierarchy(managerCustomerId: string, accessToken: string) {
 const result = await googleAdsSearch(managerCustomerId, accessToken, "SELECT customer_client.id, customer_client.client_customer, customer_client.descriptive_name, customer_client.level, customer_client.manager, customer_client.status FROM customer_client");
 return (result.results ?? []).map((row) => parseGoogleAdsCustomerClientRow(row)).filter(Boolean) as GoogleAdsCustomer[];
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

export function createGoogleAdsOauthState(businessSlug: string, businessId: string, actorUserId?: string | null, popup?: boolean) {
 return { state: randomBytes(24).toString("base64url"), businessSlug, businessId, actorUserId: actorUserId ?? null, popup: popup === true };
}

export function googleAdsOauthUrl(state: string, options?: { forceAccountSelection?: boolean }) {
 const { clientId } = credentials();
 if (!clientId) throw new Error("Google Ads OAuth is not configured.");
 const url = new URL(oauthBase);
 url.searchParams.set("client_id", clientId);
 url.searchParams.set("redirect_uri", googleAdsRedirectUri());
 url.searchParams.set("response_type", "code");
 url.searchParams.set("scope", googleAdsOauthScopes.join(" "));
 url.searchParams.set("access_type", "offline");
 url.searchParams.set("prompt", options?.forceAccountSelection ? "select_account consent" : "consent");
 url.searchParams.set("state", state);
 logGoogleAdsDiagnostic("Google Ads OAuth authorization URL created", {
  stage: "google_ads_oauth_authorization_redirect",
  provider: "google_oauth",
  redirectUri: googleAdsRedirectUri(),
  scopes: googleAdsOauthScopes,
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

export function googleAdsRecommendedLandingPages(input: {
 website: GoogleAdsDraftInput["website"];
 businessSlug: string;
 serviceName?: string | null;
 inventoryItemName?: string | null;
 businessName?: string | null;
 dedicatedPage?:{slug:string;published:boolean}|null;
}) {
 const customDomain = input.website?.customDomain && input.website?.domainStatus === "connected" ? `https://${input.website.customDomain}` : null;
 const siteRoot = input.website?.publicSlug && input.website?.status === "published" ? `${appBaseUrl}/sites/${input.website.publicSlug}` : null;
 const bookingRoot = `${appBaseUrl}/book/${input.businessSlug || slugify(input.businessName || "business")}`;
 const publicRoot = customDomain || siteRoot;
 const dedicatedServicePage = publicRoot&&input.dedicatedPage?.published&&input.dedicatedPage.slug?`${publicRoot}/${slugify(input.dedicatedPage.slug)}`:null;
 return [
  { kind: "dedicated_service_page", label: input.serviceName || input.inventoryItemName ? `${input.serviceName || input.inventoryItemName} page` : "Dedicated service page", url: dedicatedServicePage, recommended: Boolean(dedicatedServicePage) },
  { kind: "website_homepage", label: "Website homepage", url: customDomain || siteRoot, recommended: !dedicatedServicePage && Boolean(customDomain || siteRoot) },
  { kind: "booking_page", label: "Booking page", url: bookingRoot, recommended: !dedicatedServicePage && !(customDomain || siteRoot) },
 ].filter((entry) => entry.url);
}

const googleAdsAssetLimits={headline:30,description:90};
const adGroupStopWords=new Set(["christmas","holiday","plumbing","landscaping","hvac","electrician","pest","cleaning","pressure","washing"]);
const normalizedAdTerms=(value:string)=>value.toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(Boolean);
const uniqueWithinLimit=(values:string[],limit:number)=>uniqueStrings(values.map(stableTitle).filter(value=>value.length>0&&value.length<=limit));
export function validateGoogleAdsAdGroupSuggestions(input:{serviceName:string;industry:string|null;keywords:string[];negativeKeywords:string[];headlines:string[];descriptions:string[];serviceAreas:string[]}){
 const serviceTerms=normalizedAdTerms(input.serviceName).filter(term=>term.length>2);
 const allowedLocations=new Set(input.serviceAreas.flatMap(normalizedAdTerms));
 const unsupported=(value:string)=>{
  const terms=normalizedAdTerms(value);
  const hasService=serviceTerms.some(term=>terms.includes(term));
  const crossIndustry=terms.some(term=>adGroupStopWords.has(term)&&!serviceTerms.includes(term)&&term!==String(input.industry??"").toLowerCase());
  const locationClaim=value.match(/\b(?:in|near|serving)\s+([a-z][a-z .'-]{2,40})/i)?.[1]??"";
  const claimedLocationTerms=normalizedAdTerms(locationClaim).filter(term=>!["me","you","your","area","nearby"].includes(term));
  const unsupportedLocation=claimedLocationTerms.length>0&&!claimedLocationTerms.some(term=>allowedLocations.has(term));
  return crossIndustry||unsupportedLocation||(!hasService&&terms.some(term=>adGroupStopWords.has(term)));
 };
 const claims=/(#1|best |lowest|guaranteed|same.?day|24.?7|free estimate|licensed|certified)/i;
 return {
  keywords:uniqueWithinLimit(input.keywords,80).filter(value=>!unsupported(value)),
  negativeKeywords:uniqueWithinLimit(input.negativeKeywords,80).filter(value=>!serviceTerms.some(term=>normalizedAdTerms(value).includes(term))),
  headlines:uniqueWithinLimit(input.headlines,googleAdsAssetLimits.headline).filter(value=>!unsupported(value)&&!claims.test(value)),
  descriptions:uniqueWithinLimit(input.descriptions,googleAdsAssetLimits.description).filter(value=>!unsupported(value)&&!claims.test(value)),
 };
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
   response_format:{type:"json_schema",json_schema:{name:"servonas_google_ads_ad_group",strict:true,schema:{type:"object",additionalProperties:false,properties:{campaignName:{type:"string"},adGroupName:{type:"string"},keywords:{type:"array",items:{type:"string"}},negativeKeywords:{type:"array",items:{type:"string"}},headlines:{type:"array",items:{type:"string"}},descriptions:{type:"array",items:{type:"string"}}},required:["campaignName","adGroupName","keywords","negativeKeywords","headlines","descriptions"]}}},
   messages: [
    { role: "system", content: "You create concise, policy-safe Google Ads assets for a local business. Use only the supplied business, selected offer, page copy, products, and locations. Every suggestion must describe the selected offer. Never introduce another industry, unsupported location, price, discount, ranking, guarantee, certification, availability claim, or internal marketing commentary. Write descriptions directly to prospective customers. Return only the requested JSON." },
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
  businessName,
  `${serviceLabel} in ${input.businessLocation.city ?? "Your Area"}`,
  `Explore ${serviceLabel}`,
  `${serviceLabel} Options`,
  `Learn About ${serviceLabel}`,
  `${serviceLabel} From ${businessName}`,
  `Choose ${businessName}`,
  `${input.businessLocation.city ?? "Local"} ${serviceLabel}`,
  `Get Started Online`,
 ].map((value) => value.slice(0, 30))).slice(0, 12);
 const descriptions = uniqueStrings([
  `Explore ${serviceLabel.toLowerCase()} from ${businessName}. View details and take the next step online.`,
  `Looking for ${serviceLabel.toLowerCase()} in ${location}? See your options and contact ${businessName}.`,
  `Plan your next service with ${businessName}. Learn more about ${serviceLabel.toLowerCase()} today.`,
  `Visit our ${serviceLabel.toLowerCase()} page for details, options, and an easy way to get started.`,
 ].map((value) => value.slice(0, 90))).slice(0, 4);
 const suggestions=validateGoogleAdsAdGroupSuggestions({serviceName:serviceLabel,industry:input.industry,keywords:aiDraft?.keywords.length?aiDraft.keywords:fallbackKeywords,negativeKeywords:aiDraft?.negativeKeywords.length?aiDraft.negativeKeywords:defaultNegativeKeywords,headlines:aiDraft?.headlines.length?aiDraft.headlines:headlines,descriptions:aiDraft?.descriptions.length?aiDraft.descriptions:descriptions,serviceAreas:uniqueStrings([...geoValues,input.businessLocation.city??"",input.businessLocation.state??""])});
 return {
  campaignName: aiDraft?.campaignName || `${businessName} ${serviceLabel}`.slice(0, 80),
  adGroupName: aiDraft?.adGroupName || `${serviceLabel} Core`.slice(0, 80),
  destinationUrl: finalUrl(input),
  geoTargetSummary,
  geoTargetConfig,
  keywords: suggestions.keywords.length ? suggestions.keywords : fallbackKeywords,
  negativeKeywords: suggestions.negativeKeywords,
  headlines: suggestions.headlines.length>=3 ? suggestions.headlines : headlines,
  descriptions: suggestions.descriptions.length>=2 ? suggestions.descriptions : descriptions,
  aiGenerated: Boolean(aiDraft?.aiGenerated),
 };
}

export async function storeGoogleAdsConnection(input: {
 businessId: string;
 userId: string;
 refreshToken: string;
 customers: GoogleAdsCustomer[];
 rootCustomers?: GoogleAdsCustomer[];
 selectedCustomerId?: string | null;
 authenticatedIdentity?: GoogleAdsConnectionIdentity | null;
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
 const selectedCustomer = selected ? input.customers.find((customer) => customer.id === selected) ?? null : null;
  const { error } = await db.from("business_google_ads_connections").upsert({
  business_id: input.businessId,
  connected_by: input.userId,
  refresh_token: input.refreshToken,
  google_authenticated_email: input.authenticatedIdentity?.email ?? null,
  google_authenticated_name: input.authenticatedIdentity?.name ?? null,
  google_ads_customer_id: selected,
  login_customer_id: selectedCustomer?.loginCustomerId ?? null,
  accessible_root_customer_ids: (input.rootCustomers ?? input.customers).map((customer) => customer.id),
  accessible_root_customer_labels: Object.fromEntries((input.rootCustomers ?? input.customers).map((customer) => [customer.id, customer.label])),
  accessible_customer_ids: input.customers.map((customer) => customer.id),
  accessible_customer_labels: Object.fromEntries(input.customers.map((customer) => [customer.id, customer.label])),
  selectable_customer_details: input.customers,
  status: selected ? "account_selected" : "account_discovery_pending",
  account_discovery_last_successful_at: input.customers.length ? new Date().toISOString() : null,
  account_discovery_last_attempted_at: new Date().toISOString(),
  account_discovery_retry_after_at: null,
  account_discovery_last_http_status: input.customers.length ? 200 : null,
  account_discovery_last_google_status: null,
  account_discovery_last_message: null,
  account_discovery_last_request_id: null,
  connected_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
 }, { onConflict: "business_id" });
 if (error) {
  logGoogleAdsSupabaseWriteError({
   stage: "persist_connection",
   businessId: input.businessId,
   businessSlug: null,
   table: "business_google_ads_connections",
   operation: "upsert",
   error,
  });
  throw new Error("Google Ads connection could not be saved. Apply the Google Ads connection schema migration.");
 }
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
 const authenticatedIdentity = await fetchGoogleAdsAuthenticatedIdentity(token.access_token!, token.id_token ?? null, context);
 return { refreshToken: token.refresh_token, accessToken: token.access_token!, authenticatedIdentity };
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
 const { data: connection, error: connectionError } = await db.from("business_google_ads_connections")
 .select("refresh_token,google_ads_customer_id,login_customer_id,accessible_customer_ids,accessible_customer_labels,accessible_root_customer_ids,accessible_root_customer_labels,selectable_customer_details,status,google_authenticated_email,google_authenticated_name,account_discovery_last_successful_at,account_discovery_last_attempted_at,account_discovery_retry_after_at,account_discovery_last_http_status,account_discovery_last_google_status,account_discovery_last_message,account_discovery_last_request_id")
  .eq("business_id", businessId)
  .maybeSingle();
 if (connectionError) {
  logGoogleAdsErrorDiagnostic("Google Ads connection load failed", { stage: "load_google_ads_connection", provider: "supabase", requestType: "google_ads_connection_read", method: "GET", endpointHost: "supabase", endpointPath: "business_google_ads_connections", httpStatus: null, businessId, errorCode: connectionError.code, errorMessage: connectionError.message, durationMs: 0 });
  throw new Error("Servonas could not load the Google Ads connection.");
 }
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
   loginCustomerId: typeof connection.login_customer_id === "string" ? connection.login_customer_id : null,
   authenticatedIdentity: {
    email: typeof connection.google_authenticated_email === "string" ? connection.google_authenticated_email : null,
    name: typeof connection.google_authenticated_name === "string" ? connection.google_authenticated_name : null,
   },
   rootCustomerChoices: (connection.accessible_root_customer_ids ?? []).map((id: string) => ({
    id,
    label: String((connection.accessible_root_customer_labels as Record<string, unknown> | null)?.[id] ?? id),
    loginCustomerId: null,
    managerCustomerId: null,
    isManager: false,
    level: 0,
    status: null,
    source: "direct" as const,
   })),
   customerChoices: Array.isArray(connection.selectable_customer_details) && connection.selectable_customer_details.length
    ? connection.selectable_customer_details as GoogleAdsCustomer[]
    : (connection.accessible_customer_ids ?? []).map((id: string) => ({
      id,
      label: String((connection.accessible_customer_labels as Record<string, unknown> | null)?.[id] ?? id),
      loginCustomerId: null,
      managerCustomerId: null,
      isManager: false,
      level: 0,
      status: null,
     source: "direct" as const,
     })),
   status: connection.status as GoogleAdsConnectionStatus,
   discoveryState: {
    lastSuccessfulAt: typeof connection.account_discovery_last_successful_at === "string" ? connection.account_discovery_last_successful_at : null,
    lastAttemptedAt: typeof connection.account_discovery_last_attempted_at === "string" ? connection.account_discovery_last_attempted_at : null,
    retryAfterAt: typeof connection.account_discovery_retry_after_at === "string" ? connection.account_discovery_retry_after_at : null,
    lastHttpStatus: Number.isFinite(Number(connection.account_discovery_last_http_status)) ? Number(connection.account_discovery_last_http_status) : null,
    lastGoogleStatus: typeof connection.account_discovery_last_google_status === "string" ? connection.account_discovery_last_google_status : null,
    lastMessage: typeof connection.account_discovery_last_message === "string" ? connection.account_discovery_last_message : null,
    lastRequestId: typeof connection.account_discovery_last_request_id === "string" ? connection.account_discovery_last_request_id : null,
   } satisfies GoogleAdsDiscoveryState,
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

async function googleAdsSearch(customerId: string, accessToken: string, query: string, loginCustomerId?: string | null) {
 return googleAdsRequest<{ results?: Record<string, unknown>[] }>(`/customers/${stripCustomerId(customerId)}/googleAds:search`, {
  accessToken,
  method: "POST",
  customerId,
  loginCustomerId: loginCustomerId ?? undefined,
  body: { query },
 });
}

function diagnosticFailure(label: GoogleAdsPermissionDiagnosticCheck["label"], key: GoogleAdsPermissionDiagnosticCheck["key"], error: unknown): GoogleAdsPermissionDiagnosticCheck {
 const requestError = error instanceof GoogleAdsRequestError ? error : null;
 const message = error instanceof Error ? error.message : "Unknown error";
 const requestId = typeof requestError?.details?.[0]?.requestId === "string" ? requestError.details[0].requestId : null;
 return {
  key,
  label,
  passed: false,
  provider: "google_ads_api",
  httpStatus: requestError?.status ?? null,
  googleStatus: requestError?.googleStatus ?? null,
  googleMessage: message,
  details: requestId ? [`Request ID: ${requestId}`] : [],
 };
}

function classifyGoogleAdsPermissionDiagnostic(checks: GoogleAdsPermissionDiagnosticCheck[]) {
 const byKey = Object.fromEntries(checks.map((check) => [check.key, check])) as Record<GoogleAdsPermissionDiagnosticCheck["key"], GoogleAdsPermissionDiagnosticCheck | undefined>;
 if (!byKey.accessible_customers?.passed) return "OAuth identity problem or Google Ads API access problem";
 if (byKey.target_query_through_manager?.passed && !byKey.manager_query?.passed) return "Direct advertiser access checks passed. Remaining failures are likely manager-link or mutate-specific.";
 if (!byKey.manager_query?.passed) return "OAuth identity does not have usable access to the Servonas manager account or developer-token/API authorization is blocked";
 if (!byKey.manager_hierarchy?.passed) return "Servonas manager account cannot see the target advertiser in its manager hierarchy";
 if (!byKey.target_query_through_manager?.passed) return "Manager hierarchy or OAuth user permissions do not allow access to the target advertiser through the Servonas manager";
 return "Read-only access checks passed. Remaining failures are likely mutate-specific.";
}

export async function runGoogleAdsPermissionDiagnostic(input: {
 businessId: string;
 managerCustomerId?: string | null;
 targetCustomerId?: string | null;
}) {
 const connection = await loadTenantGoogleAdsAccess(input.businessId);
 if (!connection?.accessToken) throw new Error("Reconnect Google Ads before running diagnostics.");
 const selectedCustomer = connection.customerChoices.find((customer: GoogleAdsCustomer) => customer.id === connection.customerId) ?? null;
 const configuredManagerCustomerId = stripCustomerId(configuredGoogleAdsLoginCustomerId() || "");
 const candidateManagerCustomerId = stripCustomerId(
  input.managerCustomerId
  || connection.loginCustomerId
  || selectedCustomer?.loginCustomerId
  || "",
 );
 const targetCustomerId = stripCustomerId(input.targetCustomerId || connection.customerId || "");
 const checks: GoogleAdsPermissionDiagnosticCheck[] = [];
 let accessibleCustomers: string[] = [];
 try {
  const list = await googleAdsRequest<GoogleAdsListResponse>("/customers:listAccessibleCustomers", {
   accessToken: connection.accessToken,
   method: "GET",
  });
  accessibleCustomers = uniqueStrings((list.resourceNames ?? []).map((name) => name.split("/").pop() ?? "").map(stripCustomerId));
  checks.push({
   key: "accessible_customers",
   label: "Accessible customers check",
   passed: true,
   provider: "google_ads_api",
   httpStatus: 200,
   googleStatus: null,
   googleMessage: null,
   details: accessibleCustomers.length ? accessibleCustomers : ["Google returned no accessible customer IDs."],
  });
 } catch (error) {
  checks.push(diagnosticFailure("Accessible customers check", "accessible_customers", error));
 }
 const accessibleRootCustomers = connection.rootCustomerChoices ?? [];
 const discoveredManagerAccounts = accessibleRootCustomers.filter((customer: GoogleAdsCustomer) => customer.isManager || customer.id === managerCustomerId);
 const discoveredAdvertiserAccounts = connection.customerChoices ?? [];
 let directAccessPassed = false;
 try {
  const directTargetResult = await googleAdsSearch(targetCustomerId, connection.accessToken, "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account FROM customer LIMIT 1");
  const row = directTargetResult.results?.[0] ?? {};
  directAccessPassed = true;
  checks.push({
   key: "target_query_through_manager",
   label: "Direct advertiser query",
   passed: true,
   provider: "google_ads_api",
   httpStatus: 200,
   googleStatus: null,
   googleMessage: null,
   details: [stableJson(row) ?? "Direct advertiser query returned a row."],
  });
 } catch (error) {
  checks.push(diagnosticFailure("Direct advertiser query", "target_query_through_manager", error));
 }
 const managerCustomerId = directAccessPassed
  ? (candidateManagerCustomerId && candidateManagerCustomerId !== targetCustomerId ? candidateManagerCustomerId : "")
  : (candidateManagerCustomerId || configuredManagerCustomerId);
 if (!managerCustomerId) {
  return {
   authenticatedGoogleAccount: connection.authenticatedIdentity ?? { email: null, name: null },
   managerCustomerId: null,
   targetCustomerId: targetCustomerId || null,
   accessibleCustomers,
   accessibleRootCustomers,
   discoveredManagerAccounts,
   discoveredAdvertiserAccounts,
   resolvedLoginCustomerId: null,
   checks,
   classification: classifyGoogleAdsPermissionDiagnostic(checks),
  } satisfies GoogleAdsPermissionDiagnostic;
 }
 if (directAccessPassed && !candidateManagerCustomerId) {
  return {
   authenticatedGoogleAccount: connection.authenticatedIdentity ?? { email: null, name: null },
   managerCustomerId: null,
   targetCustomerId: targetCustomerId || null,
   accessibleCustomers,
   accessibleRootCustomers,
   discoveredManagerAccounts,
   discoveredAdvertiserAccounts,
   resolvedLoginCustomerId: null,
   checks,
   classification: classifyGoogleAdsPermissionDiagnostic(checks),
  } satisfies GoogleAdsPermissionDiagnostic;
 }
 try {
  const managerResult = await googleAdsSearch(managerCustomerId, connection.accessToken, "SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1");
  const row = managerResult.results?.[0] ?? {};
  checks.push({
   key: "manager_query",
   label: "Manager query",
   passed: true,
   provider: "google_ads_api",
   httpStatus: 200,
   googleStatus: null,
   googleMessage: null,
   details: [stableJson(row) ?? "Manager query returned a row."],
  });
 } catch (error) {
  checks.push(diagnosticFailure("Manager query", "manager_query", error));
 }
 try {
  const targetResult = await googleAdsSearch(targetCustomerId, connection.accessToken, "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account FROM customer LIMIT 1", managerCustomerId || null);
  const row = targetResult.results?.[0] ?? {};
  checks.push({
   key: "target_query_through_manager",
   label: "Target customer query through manager",
   passed: true,
   provider: "google_ads_api",
   httpStatus: 200,
   googleStatus: null,
   googleMessage: null,
   details: [stableJson(row) ?? "Target query returned a row."],
  });
 } catch (error) {
  checks.push(diagnosticFailure("Target customer query through manager", "target_query_through_manager", error));
 }
 try {
  const hierarchyResult = await googleAdsSearch(managerCustomerId, connection.accessToken, `SELECT customer_client.client_customer, customer_client.id, customer_client.descriptive_name, customer_client.level, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.id = ${Number(targetCustomerId)} `);
  const rows = hierarchyResult.results ?? [];
  checks.push({
   key: "manager_hierarchy",
   label: "Manager hierarchy",
   passed: rows.length > 0,
   provider: "google_ads_api",
   httpStatus: 200,
   googleStatus: null,
   googleMessage: rows.length ? null : "Target advertiser was not returned in the manager hierarchy query.",
   details: rows.length ? rows.map((row) => stableJson(row) ?? "Hierarchy row returned.") : [`Target ${targetCustomerId} was not visible under manager ${managerCustomerId}.`],
  });
 } catch (error) {
  checks.push(diagnosticFailure("Manager hierarchy", "manager_hierarchy", error));
 }
 const validatedManagerAccess = checks.find((check) => check.key === "manager_query")?.passed === true;
 return {
  authenticatedGoogleAccount: connection.authenticatedIdentity ?? { email: null, name: null },
  managerCustomerId: validatedManagerAccess ? managerCustomerId || null : null,
  targetCustomerId: targetCustomerId || null,
  accessibleCustomers,
  accessibleRootCustomers,
  discoveredManagerAccounts,
  discoveredAdvertiserAccounts,
  resolvedLoginCustomerId: directAccessPassed ? null : (validatedManagerAccess ? managerCustomerId || null : null),
  checks,
  classification: classifyGoogleAdsPermissionDiagnostic(checks),
 } satisfies GoogleAdsPermissionDiagnostic;
}

export async function updateTenantGoogleAdsSelection(businessId: string, customerId: string) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads connection storage is unavailable.");
 const { data: connection } = await db.from("business_google_ads_connections")
  .select("selectable_customer_details")
  .eq("business_id", businessId)
  .maybeSingle();
 const selected = Array.isArray(connection?.selectable_customer_details)
  ? (connection.selectable_customer_details as GoogleAdsCustomer[]).find((customer) => customer.id === customerId) ?? null
  : null;
 if (!selected) throw new Error("Choose a Google Ads advertiser account that Servonas discovered from Google.");
 const { error } = await db.from("business_google_ads_connections")
  .update({
   google_ads_customer_id: customerId,
   login_customer_id: selected.loginCustomerId,
   status: selected.loginCustomerId ? "account_selected" : "account_access_verified",
   updated_at: new Date().toISOString(),
 })
  .eq("business_id", businessId);
 if (error) {
  logGoogleAdsSupabaseWriteError({
   stage: "google_ads_account_selection_persist_failed",
   businessId,
   businessSlug: null,
   table: "business_google_ads_connections",
   operation: "update",
   error,
  });
  throw new Error("Google Ads account selection could not be saved.");
 }
}

export async function disconnectTenantGoogleAds(businessId: string) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads connection storage is unavailable.");
 const { error } = await db.from("business_google_ads_connections")
  .update({
   status: "disconnected",
   google_ads_customer_id: null,
   login_customer_id: null,
   accessible_customer_ids: [],
   accessible_customer_labels: {},
   accessible_root_customer_ids: [],
   accessible_root_customer_labels: {},
   selectable_customer_details: [],
   updated_at: new Date().toISOString(),
 })
  .eq("business_id", businessId);
 if (error) {
  logGoogleAdsSupabaseWriteError({
   stage: "google_ads_disconnect_persist_failed",
   businessId,
   businessSlug: null,
   table: "business_google_ads_connections",
   operation: "update",
   error,
  });
  throw new Error("Google Ads could not be disconnected.");
 }
}

function resourceName(resource: string, id: string) {
 return `customers/${id}/${resource}`;
}

function mutateOperationsForCampaign(input: {
 customerId: string;
 campaignName: string;
 dailyBudgetMicros: number;
 biddingStrategy: GoogleAdsBiddingStrategy;
 manualCpcBidMicros?: number | null;
 adGroups: GoogleAdsManagedAdGroup[];
}) {
 const customerId = stripCustomerId(input.customerId);
 const budgetTemp = `${resourceName("campaignBudgets", customerId)}/-1`;
 const campaignTemp = `${resourceName("campaigns", customerId)}/-2`;
 const operations: Record<string, unknown>[] = [
  {
   campaignBudgetOperation: {
    create: {
     resourceName: budgetTemp,
     name: `${input.campaignName} Budget`,
     amountMicros: String(input.dailyBudgetMicros),
     deliveryMethod: "STANDARD",
    },
   },
  },
  {
   campaignOperation: {
   create: {
     resourceName: campaignTemp,
     name: input.campaignName,
     advertisingChannelType: "SEARCH",
     status: "PAUSED",
     campaignBudget: budgetTemp,
     ...(input.biddingStrategy === "MANUAL_CPC" ? { manualCpc: {} } : { maximizeClicks: {} }),
     containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
     networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
     },
    },
   },
  },
 ];
 for (const [index, adGroup] of input.adGroups.entries()) {
  const adGroupTemp = `${resourceName("adGroups", customerId)}/${-3 - index}`;
  operations.push({
   adGroupOperation: {
    create: {
     resourceName: adGroupTemp,
     name: adGroup.name,
     campaign: campaignTemp,
     status: "ENABLED",
     type: "SEARCH_STANDARD",
     ...(input.biddingStrategy === "MANUAL_CPC" && (adGroup.cpcBidMicros||input.manualCpcBidMicros) ? { cpcBidMicros: String(adGroup.cpcBidMicros||input.manualCpcBidMicros) } : {}),
    },
   },
  });
  operations.push(...normalizeGoogleAdsKeywords(adGroup.keywords).map((keyword) => ({
   adGroupCriterionOperation: {
    create: {
     adGroup: adGroupTemp,
     status: "ENABLED",
     keyword: { text: keyword, matchType: "PHRASE" },
    },
   },
  })));
  operations.push(...normalizeGoogleAdsKeywords(adGroup.negativeKeywords).map((keyword) => ({
   adGroupCriterionOperation: {
    create: {
     adGroup: adGroupTemp,
     negative: true,
     keyword: { text: keyword, matchType: "PHRASE" },
    },
   },
  })));
  const ads = adGroup.ads.length ? adGroup.ads : [{ headlines: [], descriptions: [], finalUrl: adGroup.destinationUrl }];
  operations.push(...ads.map((ad) => ({
   adGroupAdOperation: {
    create: {
     adGroup: adGroupTemp,
     status: "ENABLED",
     ad: {
      finalUrls: [ad.finalUrl || adGroup.destinationUrl],
      responsiveSearchAd: {
       headlines: ad.headlines.map((text) => ({ text })),
       descriptions: ad.descriptions.map((text) => ({ text })),
      },
     },
    },
   },
  })));
 }
 return operations;
}

export async function publishGoogleAdsCampaign(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 campaignName: string;
 dailyBudgetMicros: number;
 biddingStrategy: GoogleAdsBiddingStrategy;
 manualCpcBidMicros?: number | null;
 adGroups?: GoogleAdsManagedAdGroup[];
 adGroupName?: string;
 destinationUrl?: string;
 keywords?: string[];
 negativeKeywords?: string[];
 headlines?: string[];
 descriptions?: string[];
}) {
 const adGroups = (input.adGroups?.length ? input.adGroups : [{
  name: input.adGroupName || "Core Ad Group",
  destinationUrl: input.destinationUrl || `${appBaseUrl}/`,
  keywords: input.keywords ?? [],
  negativeKeywords: input.negativeKeywords ?? [],
  ads: [{
   finalUrl: input.destinationUrl || `${appBaseUrl}/`,
   headlines: limitGoogleAdsTextAssets(input.headlines ?? [], maxGoogleAdsHeadlines),
   descriptions: limitGoogleAdsTextAssets(input.descriptions ?? [], maxGoogleAdsDescriptions),
  }],
 }]).map((adGroup) => ({
  ...adGroup,
  ads: (adGroup.ads ?? []).map((ad) => ({
   ...ad,
   headlines: limitGoogleAdsTextAssets(ad.headlines, maxGoogleAdsHeadlines),
   descriptions: limitGoogleAdsTextAssets(ad.descriptions, maxGoogleAdsDescriptions),
  })),
 }));
 const mutateOperations = mutateOperationsForCampaign({
  customerId: input.customerId,
  campaignName: input.campaignName,
  dailyBudgetMicros: input.dailyBudgetMicros,
  biddingStrategy: input.biddingStrategy,
  manualCpcBidMicros: input.manualCpcBidMicros,
  adGroups,
 });
 await googleAdsRequestWithLoginFallbacks("/customers/" + stripCustomerId(input.customerId) + "/googleAds:mutate", {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: {
   mutateOperations,
   partialFailure: false,
   validateOnly: true,
  },
  publishAttempt: 1,
  mutationAttempt: 1,
 });
 const result = await googleAdsRequestWithLoginFallbacks<{ mutateOperationResponses?: any[] }>("/customers/" + stripCustomerId(input.customerId) + "/googleAds:mutate", {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: {
   mutateOperations,
   partialFailure: false,
   validateOnly: false,
  },
  suppressFailureDiagnostics: true,
  publishAttempt: 1,
  mutationAttempt: 2,
 });
 const responses = result.mutateOperationResponses ?? [];
 const campaignBudget = responses.find((row) => row.campaignBudgetResult?.resourceName)?.campaignBudgetResult?.resourceName ?? null;
 const campaign = responses.find((row) => row.campaignResult?.resourceName)?.campaignResult?.resourceName ?? null;
 const adGroupResources = responses.filter((row) => row.adGroupResult?.resourceName).map((row) => row.adGroupResult.resourceName).filter((value: unknown): value is string => typeof value === "string");
 return {
  campaignBudgetResourceName: typeof campaignBudget === "string" ? campaignBudget : null,
  campaignResourceName: typeof campaign === "string" ? campaign : null,
  campaignId: typeof campaign === "string" ? campaign.split("/").pop() ?? null : null,
  adGroupId: adGroupResources[0] ? adGroupResources[0].split("/").pop() ?? null : null,
  adGroups: adGroupResources.map((resourceName, index) => ({
   id: resourceName.split("/").pop() ?? null,
   resourceName,
   name: adGroups[index]?.name ?? null,
   destinationUrl: adGroups[index]?.destinationUrl ?? null,
  })),
 };
}

export async function createGoogleAdsAdGroup(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 campaignId: string;
 biddingStrategy: GoogleAdsBiddingStrategy;
 manualCpcBidMicros?: number | null;
 adGroup: GoogleAdsManagedAdGroup;
}) {
 const customerId = stripCustomerId(input.customerId);
 const campaignId = stripCustomerId(input.campaignId);
 const adGroupTemp = `customers/${customerId}/adGroups/-1`;
 const operations: Record<string, unknown>[] = [
  {
   adGroupOperation: {
    create: {
     resourceName: adGroupTemp,
     name: input.adGroup.name,
     campaign: `customers/${customerId}/campaigns/${campaignId}`,
     status: "ENABLED",
     type: "SEARCH_STANDARD",
     ...(input.biddingStrategy === "MANUAL_CPC" && input.manualCpcBidMicros ? { cpcBidMicros: String(input.manualCpcBidMicros) } : {}),
    },
   },
  },
  ...normalizeGoogleAdsKeywords(input.adGroup.keywords).map((keyword) => ({
   adGroupCriterionOperation: {
    create: {
     adGroup: adGroupTemp,
     status: "ENABLED",
     keyword: { text: keyword, matchType: "PHRASE" },
    },
   },
  })),
  ...normalizeGoogleAdsKeywords(input.adGroup.negativeKeywords).map((keyword) => ({
   adGroupCriterionOperation: {
    create: {
     adGroup: adGroupTemp,
     negative: true,
     keyword: { text: keyword, matchType: "PHRASE" },
    },
   },
  })),
  ...(input.adGroup.ads.length ? input.adGroup.ads : [{ finalUrl: input.adGroup.destinationUrl, headlines: [], descriptions: [] }]).map((ad) => ({
   adGroupAdOperation: {
    create: {
     adGroup: adGroupTemp,
     status: "ENABLED",
     ad: {
      finalUrls: [ad.finalUrl || input.adGroup.destinationUrl],
      responsiveSearchAd: {
       headlines: limitGoogleAdsTextAssets(ad.headlines, maxGoogleAdsHeadlines).map((text) => ({ text })),
       descriptions: limitGoogleAdsTextAssets(ad.descriptions, maxGoogleAdsDescriptions).map((text) => ({ text })),
      },
     },
    },
   },
  })),
 ];
 await googleAdsRequestWithLoginFallbacks(`/customers/${customerId}/googleAds:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: { mutateOperations: operations, partialFailure: false, validateOnly: true },
 });
 const result = await googleAdsRequestWithLoginFallbacks<{ mutateOperationResponses?: any[] }>(`/customers/${customerId}/googleAds:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: { mutateOperations: operations, partialFailure: false, validateOnly: false },
 suppressFailureDiagnostics: true,
 });
 const adGroupResourceName = result.mutateOperationResponses?.find((row) => row.adGroupResult?.resourceName)?.adGroupResult?.resourceName ?? null;
 const requestMetadata=(result as typeof result&{__servonasGoogleAdsRequest?:{requestId:string|null;httpStatus:number}}).__servonasGoogleAdsRequest;
 return {
  adGroupId: typeof adGroupResourceName === "string" ? adGroupResourceName.split("/").pop() ?? null : null,
  adGroupResourceName: typeof adGroupResourceName === "string" ? adGroupResourceName : null,
  googleRequestId:requestMetadata?.requestId??null,
  httpStatus:requestMetadata?.httpStatus??null,
 };
}

export async function verifyGoogleAdsAdGroup(input:{accessToken:string;customerId:string;campaignId:string;adGroupId:string;loginCustomerId?:string|null;businessId?:string|null}){
 const campaignId=stripCustomerId(input.campaignId),adGroupId=stripCustomerId(input.adGroupId);
 if(!campaignId||!adGroupId)return null;
 const rows=await googleAdsSearchStream(input.customerId,input.accessToken,`SELECT campaign.id, ad_group.id, ad_group.resource_name, ad_group.name, ad_group.status FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.id = ${adGroupId} LIMIT 1`,input.loginCustomerId,{stage:"google_ads_ad_group_creation_verification",requestType:"focused_ad_group_creation_verification",businessId:input.businessId??null});
 const row=rows[0],campaign=row?.campaign as Record<string,unknown>|undefined,adGroup=row?.adGroup as Record<string,unknown>|undefined;
 if(stripCustomerId(String(campaign?.id??""))!==campaignId||stripCustomerId(String(adGroup?.id??""))!==adGroupId)return null;
 return {campaignId,adGroupId,resourceName:typeof adGroup?.resourceName==="string"?adGroup.resourceName:`customers/${stripCustomerId(input.customerId)}/adGroups/${adGroupId}`,name:typeof adGroup?.name==="string"?adGroup.name:null,status:typeof adGroup?.status==="string"?adGroup.status:null};
}

export async function updateGoogleAdsManagedAdGroup(input: {
 accessToken:string;
 customerId:string;
 loginCustomerIds?:Array<string|null|undefined>;
 adGroupId:string;
 currentKeywordCriterionIds:string[];
 currentAdIds:string[];
 adGroup:GoogleAdsManagedAdGroup;
}){
 const customerId=stripCustomerId(input.customerId),adGroupId=stripCustomerId(input.adGroupId);
 if(!customerId||!adGroupId)throw new Error("A Google Ads customer and ad group are required.");
 const adGroupResource=`customers/${customerId}/adGroups/${adGroupId}`;
 const operations:Record<string,unknown>[]=[
  {adGroupOperation:{update:{resourceName:adGroupResource,name:input.adGroup.name},updateMask:"name"}},
  ...input.currentKeywordCriterionIds.map(id=>({adGroupCriterionOperation:{remove:`customers/${customerId}/adGroupCriteria/${adGroupId}~${stripCustomerId(id)}`}})),
  ...normalizeGoogleAdsKeywords(input.adGroup.keywords).map(keyword=>({adGroupCriterionOperation:{create:{adGroup:adGroupResource,status:"ENABLED",keyword:{text:keyword,matchType:"PHRASE"}}}})),
  ...normalizeGoogleAdsKeywords(input.adGroup.negativeKeywords).map(keyword=>({adGroupCriterionOperation:{create:{adGroup:adGroupResource,negative:true,keyword:{text:keyword,matchType:"PHRASE"}}}})),
  ...input.currentAdIds.map(id=>({adGroupAdOperation:{remove:`customers/${customerId}/adGroupAds/${adGroupId}~${stripCustomerId(id)}`}})),
  ...input.adGroup.ads.map(ad=>({adGroupAdOperation:{create:{adGroup:adGroupResource,status:"ENABLED",ad:{finalUrls:[ad.finalUrl||input.adGroup.destinationUrl],responsiveSearchAd:{headlines:limitGoogleAdsTextAssets(ad.headlines,maxGoogleAdsHeadlines).map(text=>({text})),descriptions:limitGoogleAdsTextAssets(ad.descriptions,maxGoogleAdsDescriptions).map(text=>({text}))}}}}})),
 ];
 const request={accessToken:input.accessToken,targetCustomerId:input.customerId,loginCustomerIds:[...(input.loginCustomerIds??[]),null],body:{mutateOperations:operations,partialFailure:false,validateOnly:true}};
 await googleAdsRequestWithLoginFallbacks(`/customers/${customerId}/googleAds:mutate`,request);
 await googleAdsRequestWithLoginFallbacks(`/customers/${customerId}/googleAds:mutate`,{...request,body:{...request.body,validateOnly:false},suppressFailureDiagnostics:true});
}

function stringSet(values: string[]) {
 return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function normalizeGoogleAdsDateForDisplay(value: string | null) {
 if (!value || !/^\d{8}$/.test(value)) return null;
 return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export async function updateGoogleAdsAdGroupBid(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 adGroupId: string;
 cpcBidMicros: number;
}) {
 if (!Number.isSafeInteger(input.cpcBidMicros) || input.cpcBidMicros <= 0) throw new Error("A positive whole-number CPC bid in micros is required.");
 const customerId = stripCustomerId(input.customerId);
 const adGroupId = stripCustomerId(input.adGroupId);
 const resourceName = `customers/${customerId}/adGroups/${adGroupId}`;
 const result = await googleAdsRequestWithLoginFallbacks<{ results?: Array<{ resourceName?: string }>; partialFailureError?: { message?: string } }>(`/customers/${customerId}/adGroups:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: {
   operations: [{
    update: {
     resourceName,
     cpcBidMicros: String(input.cpcBidMicros),
    },
    updateMask: "cpc_bid_micros",
   }],
   partialFailure: false,
  },
 });
 if (result.partialFailureError?.message) throw new Error(`Google Ads rejected the CPC update: ${result.partialFailureError.message}`);
 const returnedResourceName = result.results?.find((row) => row.resourceName === resourceName)?.resourceName ?? null;
 if (!returnedResourceName) throw new Error("Google Ads did not confirm an updated ad group for the CPC change.");
 const requestMetadata = (result as typeof result & { __servonasGoogleAdsRequest?: { requestId: string | null; httpStatus: number } }).__servonasGoogleAdsRequest;
 return { resourceName: returnedResourceName, googleRequestId: requestMetadata?.requestId ?? null, httpStatus: requestMetadata?.httpStatus ?? null, mutationResultCount: result.results?.length ?? 0, partialFailure: Boolean(result.partialFailureError?.message) };
}

export async function updateGoogleAdsKeywordBid(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 adGroupId: string;
 keywordId: string;
 cpcBidMicros: number;
}) {
 if (!Number.isSafeInteger(input.cpcBidMicros) || input.cpcBidMicros <= 0) throw new Error("A positive whole-number keyword CPC bid in micros is required.");
 const customerId = stripCustomerId(input.customerId);
 const adGroupId = stripCustomerId(input.adGroupId);
 const keywordId = stripCustomerId(input.keywordId);
 const resourceName = `customers/${customerId}/adGroupCriteria/${adGroupId}~${keywordId}`;
 return googleAdsRequestWithLoginFallbacks<{ results?: Array<{ resourceName?: string }>; partialFailureError?: { message?: string } }>(`/customers/${customerId}/adGroupCriteria:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: { operations: [{ update: { resourceName, cpcBidMicros: String(input.cpcBidMicros) }, updateMask: "cpc_bid_micros" }], partialFailure: false },
 });
}

export async function fetchGoogleAdsAdGroupBid(input: {
 accessToken: string;
 customerId: string;
 adGroupId: string;
 loginCustomerId?: string | null;
 businessId?: string | null;
}) {
 const adGroupId = stripCustomerId(input.adGroupId);
 if (!adGroupId) return null;
 const rows = await googleAdsSearchStream(input.customerId, input.accessToken, `SELECT campaign.bidding_strategy_type, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.id = ${adGroupId}`, input.loginCustomerId, { stage: "google_ads_fix_cpc_refetch", requestType: "google_ads_fix_cpc_refetch", businessId: input.businessId ?? null });
 const row = rows.find((item) => stripCustomerId(String(readGoogleAdsField(item, "adGroup.id", "ad_group.id") ?? "")) === adGroupId);
 if (!row) return null;
 return {
  id: adGroupId,
  biddingStrategyType: typeof readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type") === "string" ? String(readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type")) : null,
  name: typeof readGoogleAdsField(row, "adGroup.name", "ad_group.name") === "string" ? String(readGoogleAdsField(row, "adGroup.name", "ad_group.name")) : null,
  status: typeof readGoogleAdsField(row, "adGroup.status", "ad_group.status") === "string" ? String(readGoogleAdsField(row, "adGroup.status", "ad_group.status")) : null,
  cpcBidMicros: safeNumber(readGoogleAdsField(row, "adGroup.cpcBidMicros", "ad_group.cpc_bid_micros")),
 };
}

export async function fetchGoogleAdsManualCpcAdGroups(input: {
 accessToken: string;
 customerId: string;
 campaignId: string;
 loginCustomerId?: string | null;
 businessId?: string | null;
}) {
 const campaignId = stripCustomerId(input.campaignId);
 if (!campaignId) return [] as Array<{ campaignId: string; biddingStrategyType: string | null; id: string; name: string | null; status: string | null; cpcBidMicros: number }>;
 const rows = await googleAdsSearchStream(input.customerId, input.accessToken, `SELECT campaign.id, campaign.bidding_strategy_type, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED'`, input.loginCustomerId, { stage: "google_ads_fix_cpc_ad_group_lookup", requestType: "google_ads_fix_cpc_ad_group_lookup", businessId: input.businessId ?? null });
 return rows.map((row) => ({
  campaignId: stripCustomerId(String(readGoogleAdsField(row, "campaign.id", "campaign.id") ?? "")),
  biddingStrategyType: typeof readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type") === "string" ? String(readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type")) : null,
  id: stripCustomerId(String(readGoogleAdsField(row, "adGroup.id", "ad_group.id") ?? "")),
  name: typeof readGoogleAdsField(row, "adGroup.name", "ad_group.name") === "string" ? String(readGoogleAdsField(row, "adGroup.name", "ad_group.name")) : null,
  status: typeof readGoogleAdsField(row, "adGroup.status", "ad_group.status") === "string" ? String(readGoogleAdsField(row, "adGroup.status", "ad_group.status")) : null,
  cpcBidMicros: safeNumber(readGoogleAdsField(row, "adGroup.cpcBidMicros", "ad_group.cpc_bid_micros")),
 })).filter((row) => row.campaignId === campaignId && row.id);
}

export async function fetchGoogleAdsCampaignHealthSnapshots(input: {
 accessToken: string;
 customerId: string;
 campaignIds: string[];
 loginCustomerId?: string | null;
 businessId?: string | null;
}) {
 const ids = uniqueStrings(input.campaignIds.map(stripCustomerId).filter(Boolean));
 if (!ids.length) return [] as GoogleAdsCampaignHealthSnapshot[];
 const queryIds = ids.join(",");
 const healthQuery = async (resource: keyof GoogleAdsCampaignHealthDataQuality, query: string) => {
  const startedAt = now();
  try {
   return { rows: await googleAdsSearchStream(input.customerId, input.accessToken, query, input.loginCustomerId, { stage: `google_ads_campaign_health_${resource}_query`, requestType: `google_ads_campaign_health_${resource}_query`, businessId: input.businessId ?? null }), error: null, query };
  } catch (error) {
   const requestError = error instanceof GoogleAdsRequestError ? error : null;
   const message = error instanceof Error ? error.message : "Google Ads health query failed.";
   const failure = { code: requestError ? String(requestError.status) : null, message, requestId: requestError?.requestId ?? null, googleStatus: requestError?.googleStatus ?? null, durationMs: durationMs(startedAt), gaql: query } satisfies GoogleAdsCampaignHealthQueryError;
   // A failed diagnostic query must remain unknown, never become an empty result.
   logGoogleAdsErrorDiagnostic("Google Ads campaign health query unavailable", { stage: `google_ads_campaign_health_${resource}_query`, resource, customerId: stripCustomerId(input.customerId), campaignIds: ids, loginCustomerId: input.loginCustomerId ? stripCustomerId(input.loginCustomerId) : null, gaql: query, googleRequestId: failure.requestId, googleErrorCategory: failure.googleStatus, googleErrorCode: failure.code, googleErrorMessage: failure.message, durationMs: failure.durationMs });
   return { rows: [] as Record<string, unknown>[], error: failure, query };
  }
 };
 const [campaignResult, adGroupResult, adResult, keywordResult, conversionGoalResult] = await Promise.all([
  healthQuery("campaign", `SELECT campaign.id, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.bidding_strategy_type, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network FROM campaign WHERE campaign.id IN (${queryIds})`),
  healthQuery("adGroups", `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status, ad_group.primary_status_reasons, ad_group.cpc_bid_micros FROM ad_group WHERE campaign.id IN (${queryIds})`),
  healthQuery("ads", `SELECT campaign.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE campaign.id IN (${queryIds})`),
  healthQuery("keywords", `SELECT campaign.id, ad_group_criterion.status, ad_group_criterion.primary_status_reasons, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.cpc_bid_micros FROM keyword_view WHERE campaign.id IN (${queryIds})`),
  healthQuery("conversionGoals", "SELECT conversion_action.category, conversion_action.origin, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action"),
 ]);
 const snapshots = new Map<string, GoogleAdsCampaignHealthSnapshot>();
 const ensure = (campaignId: string) => {
  const current = snapshots.get(campaignId);
  if (current) return current;
  const dataQuality = {
   campaign: { state: campaignResult.error ? "unknown" : "verified", status: campaignResult.error ? "error" : campaignResult.rows.length ? "verified" : "empty", error: campaignResult.error },
   adGroups: { state: adGroupResult.error ? "unknown" : "verified", status: adGroupResult.error ? "error" : adGroupResult.rows.length ? "verified" : "empty", error: adGroupResult.error },
   ads: { state: adResult.error ? "unknown" : "verified", status: adResult.error ? "error" : adResult.rows.length ? "verified" : "empty", error: adResult.error },
   keywords: { state: keywordResult.error ? "unknown" : "verified", status: keywordResult.error ? "error" : keywordResult.rows.length ? "verified" : "empty", error: keywordResult.error },
   conversionGoals: { state: conversionGoalResult.error ? "unknown" : "verified", status: conversionGoalResult.error ? "error" : conversionGoalResult.rows.length ? "verified" : "empty", error: conversionGoalResult.error },
  } satisfies GoogleAdsCampaignHealthDataQuality;
  const created: GoogleAdsCampaignHealthSnapshot = { campaignId, biddingStrategyType: null, campaignStatus: null, campaignPrimaryStatus: null, campaignPrimaryStatusReasons: [], adGroupIds: [], adGroupNames: [], adGroupStatuses: [], adGroupPrimaryStatuses: [], adGroupPrimaryStatusReasons: [], adGroupCpcBidMicros: [], keywordStatuses: [], keywordPrimaryStatusReasons: [], positiveKeywords: [], negativeKeywords: [], keywordCpcBidMicros: [], adStatuses: [], adApprovalStatuses: [], adPolicyTopics: [], startDate: null, endDate: null, targetSearchNetwork: null, targetGoogleSearch: null, positiveGeoTargetType: null, negativeGeoTargetType: null, conversionGoals: [], dataQuality };
  snapshots.set(campaignId, created);
  return created;
 };
 for (const row of campaignResult.rows) {
  const campaignId = stripCustomerId(String(readGoogleAdsField(row, "campaign.id", "campaign.id") ?? ""));
  if (!campaignId) continue;
  const snapshot = ensure(campaignId);
  snapshot.campaignStatus = String(readGoogleAdsField(row, "campaign.status", "campaign.status") ?? snapshot.campaignStatus ?? "");
  snapshot.campaignPrimaryStatus = typeof readGoogleAdsField(row, "campaign.primaryStatus", "campaign.primary_status") === "string" ? String(readGoogleAdsField(row, "campaign.primaryStatus", "campaign.primary_status")) : null;
  snapshot.campaignPrimaryStatusReasons = Array.isArray(readGoogleAdsField(row, "campaign.primaryStatusReasons", "campaign.primary_status_reasons")) ? (readGoogleAdsField(row, "campaign.primaryStatusReasons", "campaign.primary_status_reasons") as unknown[]).map(String) : [];
  snapshot.startDate = typeof readGoogleAdsField(row, "campaign.startDate", "campaign.start_date") === "string" ? String(readGoogleAdsField(row, "campaign.startDate", "campaign.start_date")) : null;
  snapshot.endDate = typeof readGoogleAdsField(row, "campaign.endDate", "campaign.end_date") === "string" ? String(readGoogleAdsField(row, "campaign.endDate", "campaign.end_date")) : null;
  snapshot.biddingStrategyType = typeof readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type") === "string" ? String(readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type")) : null;
  snapshot.targetGoogleSearch = typeof readGoogleAdsField(row, "campaign.networkSettings.targetGoogleSearch", "campaign.network_settings.target_google_search") === "boolean" ? Boolean(readGoogleAdsField(row, "campaign.networkSettings.targetGoogleSearch", "campaign.network_settings.target_google_search")) : null;
  snapshot.targetSearchNetwork = typeof readGoogleAdsField(row, "campaign.networkSettings.targetSearchNetwork", "campaign.network_settings.target_search_network") === "boolean" ? Boolean(readGoogleAdsField(row, "campaign.networkSettings.targetSearchNetwork", "campaign.network_settings.target_search_network")) : null;
  snapshot.positiveGeoTargetType = typeof readGoogleAdsField(row, "campaign.geoTargetTypeSetting.positiveGeoTargetType", "campaign.geo_target_type_setting.positive_geo_target_type") === "string" ? String(readGoogleAdsField(row, "campaign.geoTargetTypeSetting.positiveGeoTargetType", "campaign.geo_target_type_setting.positive_geo_target_type")) : null;
  snapshot.negativeGeoTargetType = typeof readGoogleAdsField(row, "campaign.geoTargetTypeSetting.negativeGeoTargetType", "campaign.geo_target_type_setting.negative_geo_target_type") === "string" ? String(readGoogleAdsField(row, "campaign.geoTargetTypeSetting.negativeGeoTargetType", "campaign.geo_target_type_setting.negative_geo_target_type")) : null;
 }
 for (const row of adGroupResult.rows) {
  const campaignId = stripCustomerId(String(readGoogleAdsField(row, "campaign.id", "campaign.id") ?? ""));
  if (!campaignId) continue;
  const snapshot = ensure(campaignId);
  const status = readGoogleAdsField(row, "adGroup.status", "ad_group.status");
  const primaryStatus = readGoogleAdsField(row, "adGroup.primaryStatus", "ad_group.primary_status");
  const reasons = readGoogleAdsField(row, "adGroup.primaryStatusReasons", "ad_group.primary_status_reasons");
  const bid = safeNumber(readGoogleAdsField(row, "adGroup.cpcBidMicros", "ad_group.cpc_bid_micros"));
  const adGroupId = stripCustomerId(String(readGoogleAdsField(row, "adGroup.id", "ad_group.id") ?? ""));
  const adGroupName = readGoogleAdsField(row, "adGroup.name", "ad_group.name");
  if (adGroupId) snapshot.adGroupIds.push(adGroupId);
  if (typeof adGroupName === "string") snapshot.adGroupNames.push(adGroupName);
  if (typeof status === "string") snapshot.adGroupStatuses.push(status);
  if (typeof primaryStatus === "string") snapshot.adGroupPrimaryStatuses.push(primaryStatus);
  if (Array.isArray(reasons)) snapshot.adGroupPrimaryStatusReasons.push(...reasons.map(String));
  if (bid > 0) snapshot.adGroupCpcBidMicros.push(bid);
 }
 for (const row of adResult.rows) {
  const campaignId = stripCustomerId(String(readGoogleAdsField(row, "campaign.id", "campaign.id") ?? ""));
  if (!campaignId) continue;
  const snapshot = ensure(campaignId);
  const status = readGoogleAdsField(row, "adGroupAd.status", "ad_group_ad.status");
  const approvalStatus = readGoogleAdsField(row, "adGroupAd.policySummary.approvalStatus", "ad_group_ad.policy_summary.approval_status");
  const topics = readGoogleAdsField(row, "adGroupAd.policySummary.policyTopicEntries", "ad_group_ad.policy_summary.policy_topic_entries");
  if (typeof status === "string") snapshot.adStatuses.push(status);
  if (typeof approvalStatus === "string") snapshot.adApprovalStatuses.push(approvalStatus);
  if (Array.isArray(topics)) snapshot.adPolicyTopics.push(...topics.map((topic) => stableJson(topic) ?? "").filter(Boolean));
 }
 for (const row of keywordResult.rows) {
  const campaignId = stripCustomerId(String(readGoogleAdsField(row, "campaign.id", "campaign.id") ?? ""));
  if (!campaignId) continue;
  const snapshot = ensure(campaignId);
  const status = readGoogleAdsField(row, "adGroupCriterion.status", "ad_group_criterion.status");
  const reasons = readGoogleAdsField(row, "adGroupCriterion.primaryStatusReasons", "ad_group_criterion.primary_status_reasons");
  const negative = Boolean(readGoogleAdsField(row, "adGroupCriterion.negative", "ad_group_criterion.negative"));
  const keywordText = typeof readGoogleAdsField(row, "adGroupCriterion.keyword.text", "ad_group_criterion.keyword.text") === "string" ? normalizeKeywordText(String(readGoogleAdsField(row, "adGroupCriterion.keyword.text", "ad_group_criterion.keyword.text"))) : "";
  const bid = safeNumber(readGoogleAdsField(row, "adGroupCriterion.cpcBidMicros", "ad_group_criterion.cpc_bid_micros"));
  if (typeof status === "string") snapshot.keywordStatuses.push(status);
  if (Array.isArray(reasons)) snapshot.keywordPrimaryStatusReasons.push(...reasons.map(String));
  if (keywordText) {
   if (negative) snapshot.negativeKeywords.push(keywordText);
   else snapshot.positiveKeywords.push(keywordText);
  }
  if (bid > 0) snapshot.keywordCpcBidMicros.push(bid);
 }
 const conversionGoals = conversionGoalResult.rows.map((row) => ({
  category: typeof readGoogleAdsField(row, "conversionAction.category", "conversion_action.category") === "string" ? String(readGoogleAdsField(row, "conversionAction.category", "conversion_action.category")) : null,
  origin: typeof readGoogleAdsField(row, "conversionAction.origin", "conversion_action.origin") === "string" ? String(readGoogleAdsField(row, "conversionAction.origin", "conversion_action.origin")) : null,
  primary: typeof readGoogleAdsField(row, "conversionAction.primaryForGoal", "conversion_action.primary_for_goal") === "boolean" ? Boolean(readGoogleAdsField(row, "conversionAction.primaryForGoal", "conversion_action.primary_for_goal")) : null,
  status: typeof readGoogleAdsField(row, "conversionAction.status", "conversion_action.status") === "string" ? String(readGoogleAdsField(row, "conversionAction.status", "conversion_action.status")) : null,
 }));
 for (const snapshot of snapshots.values()) snapshot.conversionGoals = conversionGoals;
 const output = ids.map((campaignId) => ensure(campaignId));
 const assertNormalized = (resource: keyof GoogleAdsCampaignHealthDataQuality, result: { rows: Record<string, unknown>[]; error: GoogleAdsCampaignHealthQueryError | null; query: string }, normalizedCount: number) => {
  if (result.error || !result.rows.length || normalizedCount > 0) return;
  const error = { code: "NORMALIZATION_MISMATCH", message: "Google Ads returned rows that Servonas could not normalize.", requestId: null, googleStatus: null, durationMs: 0, gaql: result.query } satisfies GoogleAdsCampaignHealthQueryError;
  logGoogleAdsErrorDiagnostic("Google Ads campaign health normalization mismatch", { stage: "campaign_health_normalization_mismatch", resource, customerId: stripCustomerId(input.customerId), campaignIds: ids, rawCount: result.rows.length, normalizedCount, gaql: result.query });
  for (const snapshot of output) snapshot.dataQuality[resource] = { state: "unknown", status: "error", error };
 };
 assertNormalized("adGroups", adGroupResult, output.reduce((count, snapshot) => count + snapshot.adGroupIds.length, 0));
 assertNormalized("ads", adResult, output.reduce((count, snapshot) => count + snapshot.adStatuses.length, 0));
 assertNormalized("keywords", keywordResult, output.reduce((count, snapshot) => count + snapshot.keywordStatuses.length, 0));
 assertNormalized("campaign", campaignResult, output.filter((snapshot) => snapshot.campaignStatus || snapshot.biddingStrategyType).length);
 assertNormalized("conversionGoals", conversionGoalResult, conversionGoals.filter((goal) => goal.category || goal.origin || goal.status || goal.primary !== null).length);
 return output;
}

export function buildGoogleAdsCampaignHealth(input: {
 campaign: { status: string; daily_budget_micros: number | string | null; bidding_strategy?: string | null; manual_cpc_bid_micros?: number | string | null; destination_url?: string | null; created_at?: string | null };
 metric: GoogleAdsCampaignMetrics | null;
 status: GoogleAdsCampaignStatusSnapshot | null;
 locationTargeting: GoogleAdsCampaignLocationTargeting | null;
 snapshot: GoogleAdsCampaignHealthSnapshot | null;
 servingRelevantChangeAt?: string | null;
}) {
 const issues: GoogleAdsCampaignHealthIssue[] = [];
 const budgetMicros = Number(input.campaign.daily_budget_micros ?? 0);
 const sourceStatus = input.status?.status ?? input.snapshot?.campaignStatus ?? null;
 const sourceReasons = input.status?.primaryStatusReasons ?? input.snapshot?.campaignPrimaryStatusReasons ?? [];
 const adGroupStatuses = input.snapshot?.adGroupStatuses ?? [];
 const adStatuses = input.snapshot?.adStatuses ?? [];
 const adApprovals = input.snapshot?.adApprovalStatuses ?? [];
 const keywordStatuses = input.snapshot?.keywordStatuses ?? [];
 const keywordReasons = input.snapshot?.keywordPrimaryStatusReasons ?? [];
 const positiveKeywords = input.snapshot?.positiveKeywords ?? [];
 const negativeKeywords = input.snapshot?.negativeKeywords ?? [];
 const quality = input.snapshot?.dataQuality ?? {
  campaign: { state: "unknown", status: "error", error: { code: null, message: "Campaign diagnostics were not loaded.", requestId: null, googleStatus: null, durationMs: 0, gaql: "" } }, adGroups: { state: "unknown", status: "error", error: { code: null, message: "Ad-group diagnostics were not loaded.", requestId: null, googleStatus: null, durationMs: 0, gaql: "" } }, ads: { state: "unknown", status: "error", error: { code: null, message: "Ad diagnostics were not loaded.", requestId: null, googleStatus: null, durationMs: 0, gaql: "" } }, keywords: { state: "unknown", status: "error", error: { code: null, message: "Keyword diagnostics were not loaded.", requestId: null, googleStatus: null, durationMs: 0, gaql: "" } }, conversionGoals: { state: "unknown", status: "error", error: { code: null, message: "Conversion-goal diagnostics were not loaded.", requestId: null, googleStatus: null, durationMs: 0, gaql: "" } },
 } satisfies GoogleAdsCampaignHealthDataQuality;
 const manualBidCandidates = [...(input.snapshot?.adGroupCpcBidMicros ?? []), ...(input.snapshot?.keywordCpcBidMicros ?? [])].filter((value) => value > 0);
 const effectiveBiddingStrategy = input.snapshot?.biddingStrategyType ?? input.campaign.bidding_strategy ?? null;
 issues.push(sourceStatus === "PAUSED" || input.campaign.status === "paused"
  ? { id: "campaign_paused", severity: "warning", title: "Campaign is paused", description: "The campaign is intentionally paused, so it will not serve until you resume it.", currentValue: "Paused", recommendedAction: "Resume the campaign when you want traffic again.", canAutoFix: false }
  : { id: "campaign_enabled", severity: "healthy", title: "Campaign enabled", description: "The campaign is enabled in Google Ads.", currentValue: sourceStatus ?? "Enabled", recommendedAction: "Keep monitoring delivery.", canAutoFix: false });
 issues.push(quality.adGroups.state === "unknown"
  ? { id: "ad_group_unknown", severity: "info", title: "Ad group status could not be verified", description: "Google Ads did not return ad-group diagnostics, so Servonas cannot confirm whether an ad group is active.", currentValue: null, recommendedAction: "Refresh campaign health after Google Ads diagnostics are available.", canAutoFix: false, category: "serving" }
  : !adGroupStatuses.length || adGroupStatuses.every((status) => status === "PAUSED" || status === "REMOVED")
  ? { id: "ad_group_inactive", severity: "critical", title: "Ad group is not active", description: "This campaign does not currently have an enabled ad group that can serve.", currentValue: adGroupStatuses.length ? adGroupStatuses.join(", ") : "No ad groups found", recommendedAction: "Enable an ad group in Google Ads.", canAutoFix: false }
  : { id: "ad_group_eligible", severity: "healthy", title: "Ad group eligible", description: "At least one ad group is enabled for this campaign.", currentValue: input.snapshot?.adGroupNames[0] ?? adGroupStatuses[0] ?? "Enabled", recommendedAction: "Keep the ad group active.", canAutoFix: false });
 if (quality.ads.state === "unknown") issues.push({ id: "ads_unknown", severity: "info", title: "Ad status could not be verified", description: "Google Ads did not return ad diagnostics, so Servonas cannot confirm ad approval or serving state.", currentValue: null, recommendedAction: "Refresh campaign health after Google Ads diagnostics are available.", canAutoFix: false, category: "serving" });
 else if (!adStatuses.length) issues.push({ id: "no_ads", severity: "critical", title: "No active ads found", description: "Google Ads confirmed that this campaign has no usable ads.", currentValue: "No ads returned", recommendedAction: "Add or repair an ad in Google Ads.", canAutoFix: false });
 else if (adApprovals.length && adApprovals.every((status) => status === "DISAPPROVED")) issues.push({ id: "ads_disapproved", severity: "critical", title: "Ads are disapproved", description: "Google policy review is blocking every ad in this campaign.", currentValue: "Disapproved", recommendedAction: "Review Google policy messages and update the ad.", canAutoFix: false });
 else if (adApprovals.some((status) => status === "UNDER_REVIEW")) issues.push({ id: "ads_under_review", severity: "info", title: "Ads are still under review", description: "Google is still reviewing at least one ad before it can fully serve.", currentValue: "Under review", recommendedAction: "Wait for Google review to finish, then refresh status.", canAutoFix: false });
 else issues.push({ id: "ads_approved", severity: "healthy", title: "Ads approved", description: "Google has at least one usable ad available for this campaign.", currentValue: adApprovals[0] ?? "Approved", recommendedAction: "Keep watching policy status.", canAutoFix: false });
 const locationCount = input.locationTargeting?.targetedLocations.length ?? 0;
 issues.push(!input.locationTargeting
  ? { id: "locations_unknown", severity: "info", title: "Location targeting could not be verified", description: "Servonas could not load live location targets from Google Ads.", currentValue: null, recommendedAction: "Refresh campaign health after location diagnostics are available.", canAutoFix: false, category: "serving" }
  : locationCount <= 0
  ? { id: "no_locations", severity: "critical", title: "No explicit locations are configured", description: "A local service campaign usually needs at least one positive location target to serve where you actually work.", currentValue: "No positive locations", recommendedAction: "Add one or more service locations.", canAutoFix: false }
  : { id: "locations_configured", severity: "healthy", title: "Locations configured", description: "This campaign has explicit positive location targets.", currentValue: `${locationCount} location${locationCount === 1 ? "" : "s"}`, recommendedAction: "Keep locations aligned with your service area.", canAutoFix: false });
 if (quality.keywords.state === "unknown") issues.push({ id: "keywords_unknown", severity: "info", title: "Keyword status could not be verified", description: "Google Ads did not return keyword diagnostics, so Servonas cannot confirm active keywords.", currentValue: null, recommendedAction: "Refresh campaign health after keyword diagnostics are available.", canAutoFix: false, category: "serving" });
 else if (!positiveKeywords.length || keywordStatuses.every((status) => status === "PAUSED" || status === "REMOVED")) issues.push({ id: "keywords_inactive", severity: "critical", title: "No active keywords found", description: "Google Ads confirmed that this campaign has no active positive keywords that can match searches.", currentValue: positiveKeywords.length ? `${positiveKeywords.length} keywords` : "No positive keywords", recommendedAction: "Review and enable your keywords.", canAutoFix: false });
 else if (positiveKeywords.length > 0 && keywordReasons.length >= positiveKeywords.length && keywordReasons.every((reason) => reason.includes("LOW_SEARCH_VOLUME"))) issues.push({ id: "keywords_low_volume", severity: "warning", title: "Keywords have low search volume", description: "Google is flagging the current keyword set as too low-volume to serve consistently.", currentValue: `${positiveKeywords.length} of ${positiveKeywords.length} low-volume`, recommendedAction: "Broaden or replace the keyword list.", canAutoFix: false });
 const positiveKeywordSet = stringSet(positiveKeywords);
 const overlappingKeywords = [...stringSet(negativeKeywords)].filter((keyword) => positiveKeywordSet.has(keyword));
 if (overlappingKeywords.length) issues.push({ id: "negative_keyword_conflict", severity: "warning", title: "Negative keywords may block your own targeting", description: "At least one keyword appears in both your positive and negative lists, which can suppress delivery.", currentValue: overlappingKeywords.slice(0, 3).join(", "), recommendedAction: "Review the overlapping negative keywords.", canAutoFix: false });
 if (effectiveBiddingStrategy === "MANUAL_CPC" && quality.adGroups.state === "verified") {
  const currentManualBidMicros = manualBidCandidates.length ? Math.min(...manualBidCandidates) : Number(input.campaign.manual_cpc_bid_micros ?? 0);
  if (currentManualBidMicros > 0 && currentManualBidMicros <= googleAdsCriticalManualCpcMicros) issues.push({ id: "manual_cpc_too_low", severity: "critical", title: "Max CPC is extremely low", description: `Your current max CPC is ${microsToCurrency(currentManualBidMicros)}, which may prevent the campaign from entering competitive auctions.`, currentValue: microsToCurrency(currentManualBidMicros), recommendedAction: `Increase max CPC toward a safer starting point such as ${microsToCurrency(googleAdsRecommendedManualCpcMicros)}.`, canAutoFix: true, fixActionId: "increase_manual_cpc" });
  else if (currentManualBidMicros > googleAdsCriticalManualCpcMicros && currentManualBidMicros < googleAdsWarningManualCpcMicros) issues.push({ id: "manual_cpc_low", severity: "warning", title: "Max CPC may be too low to compete effectively", description: `The current max CPC of ${microsToCurrency(currentManualBidMicros)} may be too low for many searches.`, currentValue: microsToCurrency(currentManualBidMicros), recommendedAction: "Consider raising the bid if impressions stay low.", canAutoFix: true, fixActionId: "increase_manual_cpc" });
  else if (currentManualBidMicros >= googleAdsWarningManualCpcMicros) issues.push({ id: "manual_cpc_ok", severity: "healthy", title: "Manual CPC is within a safer starting range", description: "The current manual bid is above the low-bid warning threshold.", currentValue: microsToCurrency(currentManualBidMicros), recommendedAction: "Watch real performance before changing bids.", canAutoFix: false });
  if (currentManualBidMicros > 0 && budgetMicros > 0 && currentManualBidMicros >= budgetMicros * 0.6) issues.push({ id: "budget_vs_bid", severity: "warning", title: "Max CPC is high relative to the daily budget", description: "This setup may only afford a small number of clicks per day.", currentValue: `${microsToCurrency(currentManualBidMicros)} bid vs ${microsToCurrency(budgetMicros)}/day`, recommendedAction: "Balance the bid and budget so the campaign can gather enough traffic.", canAutoFix: false });
 }
 if (input.snapshot?.endDate && normalizeGoogleAdsDateForDisplay(input.snapshot.endDate) && new Date(`${normalizeGoogleAdsDateForDisplay(input.snapshot.endDate)}T23:59:59Z`).getTime() < Date.now()) issues.push({ id: "campaign_ended", severity: "critical", title: "Campaign end date has passed", description: "This campaign has already reached its configured end date.", currentValue: normalizeGoogleAdsDateForDisplay(input.snapshot.endDate), recommendedAction: "Extend the end date in Google Ads if you want it to keep serving.", canAutoFix: false });
 if (input.snapshot?.targetSearchNetwork === false && input.snapshot?.targetGoogleSearch === false) issues.push({ id: "search_network_disabled", severity: "critical", title: "Search network is disabled", description: "The campaign is not configured to target Google Search right now.", currentValue: "Google Search off", recommendedAction: "Enable Google Search targeting in the campaign settings.", canAutoFix: false });
 if (input.snapshot?.positiveGeoTargetType && input.snapshot.positiveGeoTargetType !== "PRESENCE") issues.push({ id: "location_presence_mode", severity: "info", title: "Location targeting includes interest-based reach", description: "Presence-only targeting is often a tighter fit for local service campaigns.", currentValue: input.snapshot.positiveGeoTargetType.replaceAll("_", " "), recommendedAction: "Consider using presence-only targeting if lead quality is weak.", canAutoFix: false });
 if ((input.campaign.destination_url ?? "").includes("/book/")) {
  if (quality.conversionGoals.state === "unknown") issues.push({ id: "booking_conversion_unknown", severity: "info", title: "Booking conversion tracking could not be verified", description: "Servonas could not load Google Ads conversion goals for this account.", currentValue: null, recommendedAction: "Refresh campaign health after conversion-goal diagnostics are available.", canAutoFix: false, category: "conversion_tracking" });
  else {
   const goals = input.snapshot?.conversionGoals ?? [];
   const phoneGoals = goals.filter((goal) => `${goal.category} ${goal.origin}`.includes("PHONE_CALL"));
   const bookingGoals = goals.filter((goal) => `${goal.category} ${goal.origin}`.includes("WEBPAGE") && goal.primary !== false);
   if (phoneGoals.length) issues.push({ id: "phone_call_conversion_configured", severity: "healthy", title: "Phone call leads configured", description: "Google Ads has phone-call conversion goals available.", currentValue: `${phoneGoals.length} phone-call goal${phoneGoals.length === 1 ? "" : "s"}`, recommendedAction: "Keep call tracking aligned with your sales process.", canAutoFix: false, category: "conversion_tracking" });
   if (!bookingGoals.length) issues.push({ id: "booking_conversion_tracking", severity: "warning", title: "Online booking conversion is not configured", description: "This campaign sends visitors to booking. Google Ads is currently measuring phone-call leads, but completed online bookings do not appear to be a primary tracked outcome.", currentValue: phoneGoals.length ? "Phone call leads" : "No booking conversion found", recommendedAction: "Set up completed booking conversion tracking when the supported setup flow is available.", canAutoFix: false, fixActionId: "setup_booking_conversion", category: "conversion_tracking" });
  }
 }
 if (sourceReasons.length) issues.push({ id: "google_policy_or_account_notice", severity: "info", title: "Google reported additional campaign notes", description: "Google Ads returned serving or policy reasons for this campaign.", currentValue: sourceReasons.join(", "), recommendedAction: "Review the technical details and Google Ads UI for the full context.", canAutoFix: false });
 const servingRelevantChangeAt = input.servingRelevantChangeAt ?? input.campaign.created_at ?? input.snapshot?.startDate ?? null;
 const servingChangeAgeHours = servingRelevantChangeAt ? (Date.now() - new Date(servingRelevantChangeAt).getTime()) / (60 * 60 * 1000) : null;
 const zeroImpressions = input.metric?.impressions === 0;
 const servingBlockerIds = new Set(["campaign_paused", "ad_group_inactive", "no_ads", "ads_disapproved", "ads_under_review", "no_locations", "keywords_inactive", "keywords_low_volume", "negative_keyword_conflict", "manual_cpc_too_low", "manual_cpc_low", "campaign_ended", "search_network_disabled"]);
 const servingEligible = (sourceStatus === "ENABLED" || input.campaign.status === "published")
  && quality.adGroups.state === "verified"
  && quality.ads.state === "verified"
  && quality.keywords.state === "verified"
  && Boolean(input.locationTargeting)
  && !issues.some((issue) => servingBlockerIds.has(issue.id));
 const withinNoImpressionGracePeriod = zeroImpressions && servingEligible && servingChangeAgeHours != null && servingChangeAgeHours >= 0 && servingChangeAgeHours < GOOGLE_ADS_NO_IMPRESSION_GRACE_HOURS;
 const gracePeriodHoursRemaining = withinNoImpressionGracePeriod ? Math.max(0, Math.ceil(GOOGLE_ADS_NO_IMPRESSION_GRACE_HOURS - servingChangeAgeHours!)) : 0;
 if (withinNoImpressionGracePeriod) {
  issues.push({ id: "no_impressions_monitoring", severity: "info", title: "No impressions yet", description: "Your campaign is enabled and configured to serve. Google has not recorded impressions yet, so Servonas is monitoring delivery.", currentValue: "0 impressions", recommendedAction: "No action needed yet. Servonas will keep monitoring delivery.", canAutoFix: false, category: "serving" });
 } else if (zeroImpressions && servingEligible && servingChangeAgeHours != null && servingChangeAgeHours >= GOOGLE_ADS_NO_IMPRESSION_GRACE_HOURS) {
  issues.push({ id: "no_impressions", severity: "warning", title: "No impressions yet", description: `Your campaign has been eligible to serve for more than ${GOOGLE_ADS_NO_IMPRESSION_GRACE_HOURS} hours but Google has not recorded any impressions.`, currentValue: "0 impressions", recommendedAction: "Review keyword demand, bidding, targeting, and campaign schedule.", canAutoFix: false, category: "serving" });
 }
 const optimizationIssueIds = new Set(["keywords_low_volume", "negative_keyword_conflict", "manual_cpc_too_low", "manual_cpc_low", "manual_cpc_ok", "budget_vs_bid", "no_impressions", "location_presence_mode"]);
 const categorizedIssues = issues.map((issue) => ({ ...issue, category: issue.category ?? (optimizationIssueIds.has(issue.id) ? "optimization" : "serving") }));
 const severityRank: Record<GoogleAdsCampaignHealthIssueSeverity, number> = { critical: 0, warning: 1, info: 2, healthy: 3 };
 const orderedIssues = categorizedIssues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
 const monitoringIssue = orderedIssues.find((issue) => issue.id === "no_impressions_monitoring") ?? null;
 return {
  state: orderedIssues.some((issue) => issue.severity === "critical") ? "critical_issue" as const : monitoringIssue ? "monitoring" as const : orderedIssues.some((issue) => issue.severity === "warning") ? "needs_attention" as const : "healthy" as const,
  issues: orderedIssues,
  mostImportantIssue: monitoringIssue ?? orderedIssues.find((issue) => issue.severity !== "healthy") ?? orderedIssues[0] ?? null,
  recommendedManualCpcMicros: googleAdsRecommendedManualCpcMicros,
  zeroImpressions,
  withinNoImpressionGracePeriod,
  gracePeriodHoursRemaining,
 servingRelevantChangeAt,
 };
}

function googleAdsIssueSeverity(value: "critical" | "warning" | "info" | "healthy") {
 return value === "healthy" ? "info" as const : value;
}

async function fetchGoogleAdsAccountHealthSnapshot(input: {
 accessToken: string;
 customerId: string;
 loginCustomerId?: string | null;
 businessId: string;
}) {
 const [customerRows, billingRows] = await Promise.all([
  googleAdsSearchStream(input.customerId, input.accessToken, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.level, customer_client.status, customer_client.manager FROM customer_client WHERE customer_client.level = 0 LIMIT 1", input.loginCustomerId, { stage: "google_ads_account_health_customer", requestType: "google_ads_account_health_customer", businessId: input.businessId }),
  googleAdsSearchStream(input.customerId, input.accessToken, "SELECT billing_setup.id, billing_setup.status, billing_setup.payments_account, billing_setup.payments_account_info.payments_account_id, billing_setup.payments_account_info.payments_account_name FROM billing_setup", input.loginCustomerId, { stage: "google_ads_account_health_billing", requestType: "google_ads_account_health_billing", businessId: input.businessId }),
 ]);
 const customerStatus = typeof readGoogleAdsField(customerRows[0], "customerClient.status", "customer_client.status") === "string" ? String(readGoogleAdsField(customerRows[0], "customerClient.status", "customer_client.status")) : null;
 return {
  customerId: stripCustomerId(input.customerId),
  customerStatus,
  billingStatuses: billingRows.map((row) => String(readGoogleAdsField(row, "billingSetup.status", "billing_setup.status") ?? "")).filter(Boolean),
  paymentsAccountIds: billingRows.map((row) => String(readGoogleAdsField(row, "billingSetup.paymentsAccountInfo.paymentsAccountId", "billing_setup.payments_account_info.payments_account_id") ?? "")).filter(Boolean),
  requestWarnings: [],
  checkedAt: new Date().toISOString(),
 } satisfies GoogleAdsAccountHealthSnapshot;
}

function buildGoogleAdsAccountIssues(input: {
 connectionStatus: GoogleAdsConnectionStatus;
 customerId: string;
 accountHealth: GoogleAdsAccountHealthSnapshot | null;
 failure?: { type: string; message: string; googleStatus?: string | null; requestId?: string | null } | null;
}) {
 const issues: MarketingIssueInput[] = [];
 if (input.connectionStatus === "reauthorization_required") issues.push({ provider: "google_ads", integrationAccountId: input.customerId, issueType: "oauth_reauthorization_required", severity: "critical", title: "Google Ads connection needs to be reconnected", message: "Servonas can no longer refresh the connected Google Ads access. Reconnect Google Ads to restore account checks and campaign management.", recommendedAction: "Reconnect Google Ads in Servonas.", dedupeKey: `google_ads:${input.customerId}:oauth_reauthorization_required` });
 if (input.failure) {
  const criticalFailure = new Set(["PERMISSION_DENIED", "AUTHENTICATION_ERROR", "CUSTOMER_NOT_FOUND"]);
  issues.push({ provider: "google_ads", integrationAccountId: input.customerId, issueType: input.failure.type, severity: criticalFailure.has(input.failure.googleStatus ?? "") ? "critical" : "warning", title: criticalFailure.has(input.failure.googleStatus ?? "") ? "Google Ads account access needs attention" : "Google Ads status check could not finish", message: criticalFailure.has(input.failure.googleStatus ?? "") ? "Servonas could not access the selected Google Ads account with the current permissions." : "Servonas could not complete the latest Google Ads account health check.", recommendedAction: criticalFailure.has(input.failure.googleStatus ?? "") ? "Reconnect Google Ads or verify account access in Google Ads." : "Try checking Google Ads status again shortly.", dedupeKey: `google_ads:${input.customerId}:${input.failure.type}`, metadata: { googleStatus: input.failure.googleStatus ?? null, requestId: input.failure.requestId ?? null, technicalMessage: input.failure.message } });
 }
 const health = input.accountHealth;
 if (!health) return issues;
 if (!health.billingStatuses.length) issues.push({ provider: "google_ads", integrationAccountId: input.customerId, issueType: "billing_setup_missing", severity: "critical", title: "Google Ads billing needs attention", message: "Servonas could not find an active Google Ads billing setup for this account. Ads may not serve until billing is configured.", recommendedAction: "Open Google Ads and review the billing setup for this account.", externalResourceType: "google_ads_customer", externalResourceId: input.customerId, dedupeKey: `google_ads:${input.customerId}:billing_setup_missing` });
 if (health.billingStatuses.some((status) => status === "CANCELLED")) issues.push({ provider: "google_ads", integrationAccountId: input.customerId, issueType: "billing_setup_inactive", severity: "critical", title: "Google Ads billing is inactive", message: "Google Ads reported a cancelled billing setup for this account. Ads may stop serving until billing is restored.", recommendedAction: "Open Google Ads and restore or replace the billing setup.", externalResourceType: "google_ads_customer", externalResourceId: input.customerId, dedupeKey: `google_ads:${input.customerId}:billing_setup_inactive` });
 if (health.billingStatuses.some((status) => status === "APPROVED_HELD")) issues.push({ provider: "google_ads", integrationAccountId: input.customerId, issueType: "billing_setup_held", severity: "warning", title: "Google Ads billing needs review", message: "Google Ads reported a held billing setup. This is the closest documented billing signal Servonas can verify through the API.", recommendedAction: "Open Google Ads billing and review the payments account.", externalResourceType: "google_ads_customer", externalResourceId: input.customerId, dedupeKey: `google_ads:${input.customerId}:billing_setup_held`, metadata: { apiLimitation: "Google Ads API does not expose the exact payment-threshold warning text seen in the Google Ads UI." } });
 if (health.customerStatus === "SUSPENDED") issues.push({ provider: "google_ads", integrationAccountId: input.customerId, issueType: "account_suspended", severity: "critical", title: "Google Ads account is suspended", message: "Google Ads reported that this advertiser account is suspended, which can stop ads from serving.", recommendedAction: "Open Google Ads and resolve the suspension before relying on this account.", externalResourceType: "google_ads_customer", externalResourceId: input.customerId, dedupeKey: `google_ads:${input.customerId}:account_suspended` });
 if (health.customerStatus === "CANCELED" || health.customerStatus === "CLOSED") issues.push({ provider: "google_ads", integrationAccountId: input.customerId, issueType: "account_closed", severity: "critical", title: "Google Ads account is closed", message: "Google Ads reported that this advertiser account is closed or canceled, so it cannot keep serving ads.", recommendedAction: "Reconnect a usable Google Ads account or reopen the account in Google Ads.", externalResourceType: "google_ads_customer", externalResourceId: input.customerId, dedupeKey: `google_ads:${input.customerId}:account_closed` });
 return issues;
}

export async function checkGoogleAdsBusinessIssues(input: {
 businessId: string;
 businessSlug: string;
 force?: boolean;
 freshnessMinutes?: number;
}) {
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Google Ads issue checks are unavailable.");
 const freshnessMinutes = input.freshnessMinutes ?? 20;
 const { data: connectionRow } = await db.from("business_google_ads_connections").select("google_ads_customer_id,last_issue_check_at,status").eq("business_id", input.businessId).maybeSingle();
 const selectedCustomerId = typeof connectionRow?.google_ads_customer_id === "string" ? connectionRow.google_ads_customer_id : null;
 const lastIssueCheckAt = typeof connectionRow?.last_issue_check_at === "string" ? connectionRow.last_issue_check_at : null;
 if (!input.force && selectedCustomerId && lastIssueCheckAt && Date.now() - new Date(lastIssueCheckAt).getTime() < freshnessMinutes * 60_000) return { checked: false, stale: false, lastIssueCheckAt, issueCount: 0 };
 try {
  const connection = await loadTenantGoogleAdsAccess(input.businessId);
  if (!connection?.customerId) {
   await syncBusinessMarketingIssues({ businessId: input.businessId, businessSlug: input.businessSlug, provider: "google_ads", integrationAccountId: null, issues: [], actionUrl: `/app/${input.businessSlug}/marketing/google-ads`, checkSucceeded: true });
   return { checked: false, stale: false, lastIssueCheckAt: null, issueCount: 0 };
  }
  const { data: campaigns } = await db.from("business_google_ads_campaigns").select("id,campaign_name,google_campaign_id,google_ads_customer_id,status,daily_budget_micros,bidding_strategy,manual_cpc_bid_micros,destination_url,created_at").eq("business_id", input.businessId).in("status", ["published", "paused", "archived"]);
  const campaignIds = (campaigns ?? []).map((campaign) => campaign.google_campaign_id ?? "").filter(Boolean);
  const [statusRows, snapshotRows, locationRows, metricRows, accountHealth] = await Promise.all([
   campaignIds.length ? fetchGoogleAdsCampaignStatuses({ accessToken: connection.accessToken, customerId: connection.customerId, campaignIds, loginCustomerId: connection.loginCustomerId, businessId: input.businessId }) : Promise.resolve([] as GoogleAdsCampaignStatusSnapshot[]),
   campaignIds.length ? fetchGoogleAdsCampaignHealthSnapshots({ accessToken: connection.accessToken, customerId: connection.customerId, campaignIds, loginCustomerId: connection.loginCustomerId, businessId: input.businessId }) : Promise.resolve([] as GoogleAdsCampaignHealthSnapshot[]),
   campaignIds.length ? fetchGoogleAdsCampaignLocationTargeting({ accessToken: connection.accessToken, customerId: connection.customerId, campaignIds, loginCustomerId: connection.loginCustomerId, businessId: input.businessId }) : Promise.resolve([] as GoogleAdsCampaignLocationTargeting[]),
   campaignIds.length ? fetchGoogleAdsCampaignMetrics({ accessToken: connection.accessToken, customerId: connection.customerId, dateFrom: monthStart(new Date().toISOString().slice(0, 10)), dateTo: new Date().toISOString().slice(0, 10), businessId: input.businessId }) : Promise.resolve([] as GoogleAdsCampaignMetrics[]),
   fetchGoogleAdsAccountHealthSnapshot({ accessToken: connection.accessToken, customerId: connection.customerId, loginCustomerId: connection.loginCustomerId, businessId: input.businessId }),
  ]);
  const statusesByCampaignId = new Map(statusRows.map((row) => [row.campaignId, row]));
  const snapshotsByCampaignId = new Map(snapshotRows.map((row) => [row.campaignId, row]));
  const locationsByCampaignId = new Map(locationRows.map((row) => [row.campaignId, row]));
  const metricsByCampaignId = new Map(metricRows.map((row) => [row.campaignId, row]));
  const issues = buildGoogleAdsAccountIssues({ connectionStatus: connection.status, customerId: connection.customerId, accountHealth });
  for (const campaign of campaigns ?? []) {
   if (!campaign.google_campaign_id || !campaign.google_ads_customer_id) continue;
   const health = buildGoogleAdsCampaignHealth({ campaign, metric: metricsByCampaignId.get(campaign.google_campaign_id) ?? null, status: statusesByCampaignId.get(campaign.google_campaign_id) ?? null, locationTargeting: locationsByCampaignId.get(campaign.google_campaign_id) ?? null, snapshot: snapshotsByCampaignId.get(campaign.google_campaign_id) ?? null, servingRelevantChangeAt: campaign.created_at ?? null });
   for (const issue of health.issues) {
    if (issue.severity === "healthy" || issue.category === "optimization") continue;
    issues.push({ provider: "google_ads", integrationAccountId: campaign.google_ads_customer_id, issueType: `campaign_${issue.id}`, severity: issue.id === "campaign_paused" ? "info" : googleAdsIssueSeverity(issue.severity), title: issue.title, message: issue.description, recommendedAction: issue.recommendedAction, externalResourceType: "google_ads_campaign", externalResourceId: campaign.google_campaign_id, dedupeKey: `google_ads:${campaign.google_ads_customer_id}:campaign:${campaign.google_campaign_id}:${issue.id}`, metadata: { campaignId: campaign.id, googleCampaignId: campaign.google_campaign_id, campaignName: campaign.campaign_name, category: issue.category ?? "serving", currentValue: issue.currentValue ?? null } });
   }
  }
  const checkedAt = new Date().toISOString();
  await syncBusinessMarketingIssues({ businessId: input.businessId, businessSlug: input.businessSlug, provider: "google_ads", integrationAccountId: connection.customerId, issues, actionUrl: `/app/${input.businessSlug}/marketing/google-ads`, actionLabel: "View details", checkSucceeded: true });
  await db.from("business_google_ads_connections").update({ last_issue_check_at: checkedAt, last_issue_check_error: null, updated_at: checkedAt }).eq("business_id", input.businessId);
  return { checked: true, stale: false, lastIssueCheckAt: checkedAt, issueCount: issues.length };
 } catch (error) {
  const requestError = error instanceof GoogleAdsRequestError ? error : null;
  const { data: connection } = await db.from("business_google_ads_connections").select("google_ads_customer_id,status").eq("business_id", input.businessId).maybeSingle();
  const customerId = typeof connection?.google_ads_customer_id === "string" ? connection.google_ads_customer_id : "unknown";
  const issues = buildGoogleAdsAccountIssues({ connectionStatus: (connection?.status as GoogleAdsConnectionStatus | null) ?? "disconnected", customerId, accountHealth: null, failure: { type: "account_check_failed", message: error instanceof Error ? error.message : "Google Ads status check failed.", googleStatus: requestError?.googleStatus ?? null, requestId: requestError?.requestId ?? null } });
  if (issues.length) await syncBusinessMarketingIssues({ businessId: input.businessId, businessSlug: input.businessSlug, provider: "google_ads", integrationAccountId: customerId, issues, actionUrl: `/app/${input.businessSlug}/marketing/google-ads`, actionLabel: "View details", checkSucceeded: false });
  await db.from("business_google_ads_connections").update({ last_issue_check_failed_at: new Date().toISOString(), last_issue_check_error: error instanceof Error ? error.message.slice(0, 500) : "Google Ads status check failed.", updated_at: new Date().toISOString() }).eq("business_id", input.businessId);
  return { checked: false, stale: true, lastIssueCheckAt, issueCount: issues.length };
 }
}

export async function reviewGoogleAdsCampaignHealthWithAi(input: { businessId: string; snapshot: GoogleAdsCampaignHealthSnapshot | null; issues: GoogleAdsCampaignHealthIssue[]; withinGracePeriod?: boolean; gracePeriodHoursRemaining?: number }) {
 const apiKey = process.env.OPENAI_API_KEY?.trim();
 if (!apiKey || !input.snapshot) return null as GoogleAdsCampaignHealthAiReview | null;
 const verifiedFacts = {
  campaign: { status: input.snapshot.campaignStatus, servingStatus: input.snapshot.campaignPrimaryStatus, biddingStrategy: input.snapshot.biddingStrategyType },
  adGroups: input.snapshot.dataQuality.adGroups.state === "verified" ? { statuses: input.snapshot.adGroupStatuses, bidsMicros: input.snapshot.adGroupCpcBidMicros } : "unknown",
  ads: input.snapshot.dataQuality.ads.state === "verified" ? { statuses: input.snapshot.adStatuses, approvals: input.snapshot.adApprovalStatuses } : "unknown",
  keywords: input.snapshot.dataQuality.keywords.state === "verified" ? { count: input.snapshot.positiveKeywords.length, statuses: input.snapshot.keywordStatuses } : "unknown",
  conversionGoals: input.snapshot.dataQuality.conversionGoals.state === "verified" ? input.snapshot.conversionGoals : "unknown",
  dataQuality: input.snapshot.dataQuality,
  zeroImpressions: input.issues.some((issue) => issue.id === "no_impressions" || issue.id === "no_impressions_monitoring"),
  withinGracePeriod: input.withinGracePeriod ?? input.issues.some((issue) => issue.id === "no_impressions_monitoring"),
  gracePeriodHoursRemaining: input.gracePeriodHoursRemaining ?? 0,
  deterministicFindings: input.issues.filter((issue) => issue.severity !== "healthy").map((issue) => ({ id: issue.id, category: issue.category ?? "serving", severity: issue.severity, title: issue.title, evidence: issue.currentValue ?? issue.description })),
 };
 try {
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini", temperature: 0, response_format: { type: "json_schema", json_schema: { name: "google_ads_campaign_health_review", strict: true, schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string" }, recommendationIds: { type: "array", items: { type: "string" } } }, required: ["summary", "recommendationIds"] } } }, messages: [{ role: "system", content: "You review Google Ads facts for a small-business owner. Only use the supplied verified facts and deterministic findings. Never invent campaign facts. Treat unknown as unknown; never treat it as an empty result or zero count. Do not claim causation. Prioritize serving before optimization and conversion tracking. If withinGracePeriod is true and the deterministic findings show no serving blocker, do not describe zero impressions as a problem or recommend changing bids, targeting, or keyword demand. Explain that Servonas is monitoring delivery. Return only the requested JSON." }, { role: "user", content: JSON.stringify(verifiedFacts) }] }) });
  if (!response.ok) return null;
  const body = await response.json() as any;
  const parsed = JSON.parse(String(body.choices?.[0]?.message?.content ?? "{}")) as { summary?: unknown; recommendationIds?: unknown };
  const allowed = new Set(input.issues.map((issue) => issue.id));
  return { summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : "", recommendationIds: Array.isArray(parsed.recommendationIds) ? parsed.recommendationIds.map(String).filter((id) => allowed.has(id)).slice(0, 4) : [] } satisfies GoogleAdsCampaignHealthAiReview;
 } catch {
  return null;
 }
}

export async function fetchGoogleAdsKeywordReviewSnapshot(input: {
 accessToken: string; customerId: string; campaignId: string; campaignName: string | null; dailyBudgetMicros: number | null; industry: string | null; locations: string[]; dateFrom: string; dateTo: string; loginCustomerId?: string | null; businessId?: string | null;
}) {
 const campaignId = stripCustomerId(input.campaignId);
 if (!campaignId) throw new Error("A valid Google Ads campaign is required.");
 const dateFilter = googleAdsCustomDateRangeFilter(input.dateFrom, input.dateTo);
 const [rows, adGroupRows, conversionGoalRows, searchTerms] = await Promise.all([
  googleAdsSearchStream(input.customerId, input.accessToken,
   `SELECT campaign.id, campaign.name, campaign.bidding_strategy_type, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.status, ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, ad_group_criterion.final_urls, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_micros FROM keyword_view WHERE campaign.id = ${campaignId} AND ${dateFilter}`,
   input.loginCustomerId, { stage: "google_ads_keyword_review_snapshot", requestType: "keyword_review", businessId: input.businessId ?? null }),
  googleAdsSearchStream(input.customerId, input.accessToken,
   `SELECT ad_group.id, ad_group.cpc_bid_micros FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED'`,
   input.loginCustomerId, { stage: "google_ads_keyword_review_ad_groups", requestType: "keyword_review_ad_groups", businessId: input.businessId ?? null }),
  googleAdsSearchStream(input.customerId, input.accessToken,
   "SELECT conversion_action.category, conversion_action.origin, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action",
   input.loginCustomerId, { stage: "google_ads_keyword_review_conversion_goals", requestType: "keyword_review_conversion_goals", businessId: input.businessId ?? null }),
  fetchGoogleAdsSearchTerms({ accessToken: input.accessToken, customerId: input.customerId, campaignIds: [campaignId], dateFrom: input.dateFrom, dateTo: input.dateTo, businessId: input.businessId ?? null }).catch(() => [] as GoogleAdsSearchTerm[]),
 ]);
 const keywords = rows.map((row) => ({
  id: stripCustomerId(String(readGoogleAdsField(row, "adGroupCriterion.criterionId", "ad_group_criterion.criterion_id") ?? "")),
  text: String(readGoogleAdsField(row, "adGroupCriterion.keyword.text", "ad_group_criterion.keyword.text") ?? "").trim(),
  matchType: typeof readGoogleAdsField(row, "adGroupCriterion.keyword.matchType", "ad_group_criterion.keyword.match_type") === "string" ? String(readGoogleAdsField(row, "adGroupCriterion.keyword.matchType", "ad_group_criterion.keyword.match_type")) : null,
  status: typeof readGoogleAdsField(row, "adGroupCriterion.status", "ad_group_criterion.status") === "string" ? String(readGoogleAdsField(row, "adGroupCriterion.status", "ad_group_criterion.status")) : null,
  primaryStatus: typeof readGoogleAdsField(row, "adGroupCriterion.primaryStatus", "ad_group_criterion.primary_status") === "string" ? String(readGoogleAdsField(row, "adGroupCriterion.primaryStatus", "ad_group_criterion.primary_status")) : null,
  primaryStatusReasons: Array.isArray(readGoogleAdsField(row, "adGroupCriterion.primaryStatusReasons", "ad_group_criterion.primary_status_reasons")) ? (readGoogleAdsField(row, "adGroupCriterion.primaryStatusReasons", "ad_group_criterion.primary_status_reasons") as unknown[]).map(String) : [],
  negative: Boolean(readGoogleAdsField(row, "adGroupCriterion.negative", "ad_group_criterion.negative")),
  cpcBidMicros: (() => { const value = safeNumber(readGoogleAdsField(row, "adGroupCriterion.cpcBidMicros", "ad_group_criterion.cpc_bid_micros")); return value || null; })(),
  // Google Ads v25 does not expose first-page/top-of-page criterion estimates in keyword_view.
  bidEstimates: { status: "unavailable" as const },
  qualityScore: (() => { const value = safeNumber(readGoogleAdsField(row, "adGroupCriterion.qualityInfo.qualityScore", "ad_group_criterion.quality_info.quality_score")); return value || null; })(),
  creativeQualityScore: typeof readGoogleAdsField(row, "adGroupCriterion.qualityInfo.creativeQualityScore", "ad_group_criterion.quality_info.creative_quality_score") === "string" ? String(readGoogleAdsField(row, "adGroupCriterion.qualityInfo.creativeQualityScore", "ad_group_criterion.quality_info.creative_quality_score")) : null,
  postClickQualityScore: typeof readGoogleAdsField(row, "adGroupCriterion.qualityInfo.postClickQualityScore", "ad_group_criterion.quality_info.post_click_quality_score") === "string" ? String(readGoogleAdsField(row, "adGroupCriterion.qualityInfo.postClickQualityScore", "ad_group_criterion.quality_info.post_click_quality_score")) : null,
  searchPredictedCtr: typeof readGoogleAdsField(row, "adGroupCriterion.qualityInfo.searchPredictedCtr", "ad_group_criterion.quality_info.search_predicted_ctr") === "string" ? String(readGoogleAdsField(row, "adGroupCriterion.qualityInfo.searchPredictedCtr", "ad_group_criterion.quality_info.search_predicted_ctr")) : null,
  adGroupId: (() => { const value = stripCustomerId(String(readGoogleAdsField(row, "adGroup.id", "ad_group.id") ?? "")); return value || null; })(),
  adGroupName: typeof readGoogleAdsField(row, "adGroup.name", "ad_group.name") === "string" ? String(readGoogleAdsField(row, "adGroup.name", "ad_group.name")) : null,
  finalUrls: Array.isArray(readGoogleAdsField(row, "adGroupCriterion.finalUrls", "ad_group_criterion.final_urls")) ? (readGoogleAdsField(row, "adGroupCriterion.finalUrls", "ad_group_criterion.final_urls") as unknown[]).map(String).filter(Boolean) : [],
  impressions: safeNumber(readGoogleAdsField(row, "metrics.impressions", "metrics.impressions")), clicks: safeNumber(readGoogleAdsField(row, "metrics.clicks", "metrics.clicks")), ctr: safeNumber(readGoogleAdsField(row, "metrics.ctr", "metrics.ctr")), averageCpcMicros: safeNumber(readGoogleAdsField(row, "metrics.averageCpc", "metrics.average_cpc")), conversions: safeNumber(readGoogleAdsField(row, "metrics.conversions", "metrics.conversions")), costMicros: safeNumber(readGoogleAdsField(row, "metrics.costMicros", "metrics.cost_micros")),
 })).filter((keyword) => keyword.id && keyword.text);
 const first = rows[0];
 const impressions = keywords.reduce((sum, keyword) => sum + keyword.impressions, 0);
 const clicks = keywords.reduce((sum, keyword) => sum + keyword.clicks, 0);
 const conversions = keywords.reduce((sum, keyword) => sum + keyword.conversions, 0);
 const costMicros = keywords.reduce((sum, keyword) => sum + keyword.costMicros, 0);
 const ctr = impressions > 0 ? clicks / impressions : null;
 const averageCpcMicros = clicks > 0 ? Math.round(costMicros / clicks) : null;
 const performanceDataState = clicks < googleAdsKeywordReviewSufficientClicks ? "early" as const : "sufficient" as const;
 const conversionGoals = conversionGoalRows.map((row) => ({
  category: typeof readGoogleAdsField(row, "conversionAction.category", "conversion_action.category") === "string" ? String(readGoogleAdsField(row, "conversionAction.category", "conversion_action.category")) : null,
  origin: typeof readGoogleAdsField(row, "conversionAction.origin", "conversion_action.origin") === "string" ? String(readGoogleAdsField(row, "conversionAction.origin", "conversion_action.origin")) : null,
  primary: typeof readGoogleAdsField(row, "conversionAction.primaryForGoal", "conversion_action.primary_for_goal") === "boolean" ? Boolean(readGoogleAdsField(row, "conversionAction.primaryForGoal", "conversion_action.primary_for_goal")) : null,
  status: typeof readGoogleAdsField(row, "conversionAction.status", "conversion_action.status") === "string" ? String(readGoogleAdsField(row, "conversionAction.status", "conversion_action.status")) : null,
 }));
 const adGroupDefaultCpcMicros = adGroupRows
  .map((row) => safeNumber(readGoogleAdsField(row, "adGroup.cpcBidMicros", "ad_group.cpc_bid_micros")))
  .filter((value) => value > 0);
 return {
  generatedAt: new Date().toISOString(),
  dateFrom: input.dateFrom,
  dateTo: input.dateTo,
  performanceDataState,
  campaign: {
   id: campaignId,
   name: typeof readGoogleAdsField(first, "campaign.name", "campaign.name") === "string" ? String(readGoogleAdsField(first, "campaign.name", "campaign.name")) : input.campaignName,
   biddingStrategy: typeof readGoogleAdsField(first, "campaign.biddingStrategyType", "campaign.bidding_strategy_type") === "string" ? String(readGoogleAdsField(first, "campaign.biddingStrategyType", "campaign.bidding_strategy_type")) : null,
   dailyBudgetMicros: input.dailyBudgetMicros,
   industry: input.industry,
   locations: input.locations,
   impressions,
   clicks,
   conversions,
   costMicros,
   ctr,
   averageCpcMicros,
   costPerConversionMicros: conversions > 0 ? Math.round(costMicros / conversions) : null,
   conversionGoals,
   adGroupDefaultCpcMicros,
  },
  searchTerms: { available: searchTerms.length > 0, items: searchTerms.slice(0, 25) },
  keywords,
 } satisfies GoogleAdsKeywordReviewSnapshot;
}

export async function reviewGoogleAdsKeywordsWithAi(input: { businessId: string; googleCustomerId?: string | null; snapshot: GoogleAdsKeywordReviewSnapshot; snapshotHash?: string }) {
 const apiKey = process.env.OPENAI_API_KEY?.trim();
 if (!apiKey) return null as GoogleAdsKeywordReview | null;
 const model = process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini";
 const snapshotHash = input.snapshotHash ?? googleAdsKeywordReviewSnapshotHash(input.snapshot);
 const startedAt = now();
 const metadata = () => keywordReviewLogMetadata({ businessId: input.businessId, googleCustomerId: input.googleCustomerId, snapshot: input.snapshot, snapshotHash, model, durationMs: durationMs(startedAt), cacheStatus: "miss" });
 logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_started", {
  ...metadata(),
  snapshotSummary: {
   campaignId: input.snapshot.campaign.id,
   campaignName: input.snapshot.campaign.name,
   biddingStrategy: input.snapshot.campaign.biddingStrategy,
   dailyBudget: input.snapshot.campaign.dailyBudgetMicros,
   defaultMaxBid: input.snapshot.campaign.adGroupDefaultCpcMicros.length ? input.snapshot.campaign.adGroupDefaultCpcMicros : "unavailable",
   keywords: {
    totalCount: input.snapshot.keywords.length,
    enabledCount: input.snapshot.keywords.filter((keyword) => keyword.status === "ENABLED").length,
    positiveCount: input.snapshot.keywords.filter((keyword) => !keyword.negative).length,
    negativeCount: input.snapshot.keywords.filter((keyword) => keyword.negative).length,
    limitedCount: input.snapshot.keywords.filter((keyword) => keyword.primaryStatus === "LIMITED").length,
   },
   searchTerms: { count: input.snapshot.searchTerms.items.length },
   conversionGoals: { count: input.snapshot.campaign.conversionGoals.length },
   performance: { impressions: input.snapshot.campaign.impressions, clicks: input.snapshot.campaign.clicks, conversions: input.snapshot.campaign.conversions, cost: input.snapshot.campaign.costMicros },
   mode: { earlyCampaignMode: input.snapshot.performanceDataState === "early" },
   snapshot: { timestamp: input.snapshot.generatedAt, hash: snapshotHash },
   dataQuality: { searchTermsAvailable: input.snapshot.searchTerms.available, bidEstimatesAvailable: input.snapshot.keywords.some((keyword) => keyword.bidEstimates.status === "available") },
  },
 });
 const allowedIds = new Set(input.snapshot.keywords.map((keyword) => keyword.id));
 const performanceDataState = input.snapshot.performanceDataState;
 try {
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "google_ads_keyword_review", strict: true, schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string" }, recommendations: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, category: { type: "string", enum: ["bid", "pause_keyword", "keep_keyword", "add_keyword", "match_type", "negative_keyword", "budget", "conversion_tracking", "other"] }, priority: { type: "string", enum: ["high", "medium", "low"] }, title: { type: "string" }, explanation: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, keywordIds: { type: "array", items: { type: "string" } }, suggestedValue: { type: ["object", "null"], additionalProperties: false, properties: { type: { type: "string", enum: ["bid_adjustment", "keyword_list", "negative_keyword_list", "match_type_change", "budget_note", "other"] }, label: { type: "string" }, value: { type: ["string", "null"] } }, required: ["type", "label", "value"] }, canApplyInServonas: { type: "boolean" } }, required: ["id", "category", "priority", "title", "explanation", "evidence", "keywordIds", "suggestedValue", "canApplyInServonas"] } } }, required: ["summary", "recommendations"] } } }, messages: [{ role: "system", content: "You are Servonas's Google Ads keyword reviewer. Use only the supplied verified Google Ads facts. Do not invent bid estimates, demand, performance, policy state, campaign configuration, or search terms that are not present. Bid estimate fields may be unavailable. Only cite a specific Google bid estimate when a verified estimate is provided. If Google status indicates a bid limitation but no estimate is available, explain the limitation without inventing a dollar amount. Do not recommend removing, pausing, or changing a negative keyword merely because it has zero impressions; require verified search-term or campaign evidence. Any suggested dollar amount must be clearly labeled as a Servonas recommendation, not a Google estimate. Clearly separate interpretation from facts. When performanceDataState is early, explicitly acknowledge that there is not enough performance data yet to judge true conversion winners and focus on configuration, intent, match type, duplication, location intent, and verified bid constraints. Distinguish current keywords from search terms. If searchTerms.available is false, say search-term evidence is unavailable rather than inferring it. Ground every pause or bid recommendation in the supplied facts and intent. Use plain language for a small-business owner and never include raw Google IDs, criterion IDs, ad group IDs, campaign IDs, or resource names in customer-facing prose; use keyword text instead. Give 3 to 5 concise, practical recommendations. Do not claim guaranteed results." }, { role: "user", content: JSON.stringify(input.snapshot) }] }) });
  if (!response.ok) {
   logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_failed", { ...metadata(), provider: "openai", endpointHost: "api.openai.com", endpointPath: "/v1/chat/completions", httpStatus: response.status });
   return null;
  }
  let parsed: any;
  try {
   parsed = JSON.parse(String((await response.json() as any).choices?.[0]?.message?.content ?? "{}"));
  } catch {
   logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_validation_failed", { ...metadata(), reason: "response_not_json" });
   return null;
  }
  const categories = new Set(["bid", "pause_keyword", "keep_keyword", "add_keyword", "match_type", "negative_keyword", "budget", "conversion_tracking", "other"]);
  const priorities = new Set(["high", "medium", "low"]);
  const suggestedValueTypes = new Set(["bid_adjustment", "keyword_list", "negative_keyword_list", "match_type_change", "budget_note", "other"]);
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.recommendations) || parsed.recommendations.some((value: any) => !value || typeof value.id !== "string" || !categories.has(value.category) || !priorities.has(value.priority) || typeof value.title !== "string" || typeof value.explanation !== "string" || !Array.isArray(value.evidence) || value.evidence.some((item: unknown) => typeof item !== "string") || !Array.isArray(value.keywordIds) || value.keywordIds.some((id: unknown) => typeof id !== "string") || typeof value.canApplyInServonas !== "boolean" || (value.suggestedValue !== null && (!value.suggestedValue || !suggestedValueTypes.has(value.suggestedValue.type) || typeof value.suggestedValue.label !== "string" || !(typeof value.suggestedValue.value === "string" || value.suggestedValue.value === null))))) {
   logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_validation_failed", { ...metadata(), reason: "response_schema_mismatch" });
   return null;
  }
  const recommendations: GoogleAdsKeywordReview["recommendations"] = parsed.recommendations.slice(0, 5).map((value: any, index: number) => {
   const suggestedValue = value.suggestedValue && typeof value.suggestedValue === "object" && typeof value.suggestedValue.type === "string" && typeof value.suggestedValue.label === "string"
    ? { type: value.suggestedValue.type, label: value.suggestedValue.label.slice(0, 80), value: typeof value.suggestedValue.value === "string" ? value.suggestedValue.value.slice(0, 160) : null } satisfies GoogleAdsKeywordReviewSuggestedValue
    : null;
   const keywordIds = value.keywordIds.map(String).filter((id: string) => allowedIds.has(id)).slice(0, 8);
   const actionType = value.category === "bid" ? (keywordIds.length ? "adjust_keyword_bid" : "adjust_default_bid") : value.category === "pause_keyword" ? "pause_keywords" : value.category === "add_keyword" ? "add_keywords" : value.category === "negative_keyword" ? "add_negative_keywords" : value.category === "match_type" ? "change_match_type" : "review_only";
   return { id: typeof value.id === "string" ? value.id.slice(0, 80) : `review-${index + 1}`, category: value.category, actionType, suggestedDirection: value.category === "bid" ? "increase" : "review", priority: value.priority, title: value.title.slice(0, 160), explanation: value.explanation.slice(0, 600), evidence: value.evidence.filter((item: unknown) => typeof item === "string").slice(0, 5).map((item: string) => item.slice(0, 220)), keywordIds, suggestedValue, canApplyInServonas: actionType === "adjust_keyword_bid" || actionType === "adjust_default_bid" };
  });
  const review = { summary: parsed.summary.slice(0, 500), performanceDataState, keywordsReviewed: input.snapshot.keywords.filter((keyword) => !keyword.negative).length, recommendations } satisfies GoogleAdsKeywordReview;
  const prioritiesByCount = Object.fromEntries(["high", "medium", "low"].map((priority) => [priority, recommendations.filter((recommendation) => recommendation.priority === priority).length]));
  logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_completed", { ...metadata(), recommendationCount: recommendations.length, categories: [...new Set(recommendations.map((recommendation) => recommendation.category))], priorities: prioritiesByCount, keywordIdsAffected: [...new Set(recommendations.flatMap((recommendation) => recommendation.keywordIds))], applyableRecommendationCount: recommendations.filter((recommendation) => recommendation.canApplyInServonas).length });
  return review;
 } catch (error) {
  logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_failed", { ...metadata(), provider: "openai", endpointHost: "api.openai.com", endpointPath: "/v1/chat/completions", errorType: error instanceof Error ? error.name : "unknown" });
  return null;
 }
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
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
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
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
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

export async function fetchGoogleAdsCampaignMetrics(input: { accessToken: string; customerId: string; dateFrom: string; dateTo: string; businessId?: string | null }) {
 const dateFilter = googleAdsCustomDateRangeFilter(input.dateFrom, input.dateTo);
 const results = await googleAdsSearchStream(
  input.customerId,
  input.accessToken,
  `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion FROM campaign WHERE campaign.status != 'REMOVED' AND ${dateFilter}`,
  undefined,
  { stage: "google_ads_campaign_metrics_query", requestType: "campaign_metrics", businessId: input.businessId ?? null },
 );
 return results.map((row) => {
 const campaign = row.campaign as Record<string, unknown> | undefined;
 const metrics = row.metrics as Record<string, unknown> | undefined;
  const impressions = safeNumber(metrics?.impressions);
  const clicks = safeNumber(metrics?.clicks);
  return {
   campaignId: String(campaign?.id ?? ""),
   impressions,
   clicks,
   // Google returns CTR as a fraction. Deriving it from the displayed counts
   // keeps every consumer on the same unit and avoids rounding mismatches.
   ctr: impressions > 0 ? clicks / impressions : 0,
   averageCpcMicros: safeNumber(metrics?.averageCpc),
   costMicros: safeNumber(metrics?.costMicros),
   conversions: safeNumber(metrics?.conversions),
   costPerConversionMicros: safeNumber(metrics?.costPerConversion),
   status: String(campaign?.status ?? "UNKNOWN"),
  } satisfies GoogleAdsCampaignMetrics;
 }).filter((row) => row.campaignId);
}

export async function fetchGoogleAdsCampaignStatuses(input: { accessToken: string; customerId: string; campaignIds: string[]; loginCustomerId?: string | null; businessId?: string | null }) {
 if (!input.campaignIds.length) return [] as GoogleAdsCampaignStatusSnapshot[];
 const ids = uniqueStrings(input.campaignIds.map(stripCustomerId).filter(Boolean));
 if (!ids.length) return [] as GoogleAdsCampaignStatusSnapshot[];
 const startedAt = now();
 const buildSnapshots = (results: Record<string, unknown>[], issuesAvailable: boolean) => results.map((row) => {
  const campaign = row.campaign as Record<string, unknown> | undefined;
  const primaryStatusReasons = issuesAvailable
   ? safeStringArray(
    readGoogleAdsField<unknown>(campaign, "primaryStatusReasons", "primary_status_reasons")
    ?? campaign?.primaryStatusReasonsList
    ?? campaign?.primary_status_reasons_list,
   )
   : [];
  return {
   campaignId: String(readGoogleAdsField<unknown>(campaign, "id", "id") ?? ""),
   campaignResourceName: typeof readGoogleAdsField<unknown>(campaign, "resourceName", "resource_name") === "string"
    ? String(readGoogleAdsField<unknown>(campaign, "resourceName", "resource_name"))
    : null,
   status: String(readGoogleAdsField<unknown>(campaign, "status", "status") ?? "UNKNOWN"),
   primaryStatus: typeof readGoogleAdsField<unknown>(campaign, "primaryStatus", "primary_status") === "string"
    ? String(readGoogleAdsField<unknown>(campaign, "primaryStatus", "primary_status"))
    : null,
   primaryStatusReasons,
   issuesAvailable,
  } satisfies GoogleAdsCampaignStatusSnapshot;
 }).filter((row) => row.campaignId);
 const runQuery = async (query: string, issuesAvailable: boolean, variant: "full" | "fallback") => {
  logGoogleAdsDiagnostic("Google Ads campaign status query started", {
   stage: "google_ads_campaign_status_query",
   provider: "google_ads_api",
   targetCustomerId: input.customerId,
   loginCustomerId: input.loginCustomerId ?? null,
   googleCampaignIds: ids,
   queryVariant: variant,
   query,
  });
  const results = await googleAdsSearchStream(
   input.customerId,
   input.accessToken,
   query,
   input.loginCustomerId ?? undefined,
   { stage: "google_ads_campaign_status_query", requestType: "campaign_status", businessId: input.businessId ?? null },
  );
  const snapshots = buildSnapshots(results, issuesAvailable);
  logGoogleAdsDiagnostic("Google Ads campaign status query completed", {
   stage: "google_ads_campaign_status_query",
   provider: "google_ads_api",
   targetCustomerId: input.customerId,
   loginCustomerId: input.loginCustomerId ?? null,
   queryVariant: variant,
   queryResultCount: snapshots.length,
   googleCampaignStatuses: snapshots.map((snapshot) => ({
    googleCampaignId: snapshot.campaignId,
    googleCampaignStatus: snapshot.status,
    servingStatus: snapshot.primaryStatus,
    issueCount: snapshot.primaryStatusReasons.length,
    issuesAvailable: snapshot.issuesAvailable,
   })),
   durationMs: durationMs(startedAt),
  });
  return snapshots;
 };
 const fullQuery = `SELECT campaign.id, campaign.resource_name, campaign.status, campaign.primary_status, campaign.primary_status_reasons FROM campaign WHERE campaign.id IN (${ids.join(",")})`;
 const fallbackQuery = `SELECT campaign.id, campaign.resource_name, campaign.status, campaign.primary_status FROM campaign WHERE campaign.id IN (${ids.join(",")})`;
 try {
  return await runQuery(fullQuery, true, "full");
 } catch (error) {
  if (error instanceof GoogleAdsRequestError && error.status === 400 && error.googleStatus === "INVALID_ARGUMENT") {
   logGoogleAdsErrorDiagnostic("Google Ads campaign status query falling back", {
    stage: "google_ads_campaign_status_query",
    provider: "google_ads_api",
    targetCustomerId: input.customerId,
    loginCustomerId: input.loginCustomerId ?? null,
    googleCampaignIds: ids,
    queryVariant: "full",
    syncFailureReason: error.message,
    googleStatus: error.googleStatus,
   });
   try {
    return await runQuery(fallbackQuery, false, "fallback");
   } catch (fallbackError) {
    logGoogleAdsErrorDiagnostic("Google Ads campaign status fallback failed", {
     stage: "google_ads_campaign_status_query",
     provider: "google_ads_api",
     targetCustomerId: input.customerId,
     loginCustomerId: input.loginCustomerId ?? null,
     googleCampaignIds: ids,
     queryVariant: "fallback",
     durationMs: durationMs(startedAt),
     syncFailureReason: fallbackError instanceof Error ? fallbackError.message : "unknown",
     errorName: fallbackError instanceof Error ? fallbackError.name : "unknown",
     errorStatus: fallbackError && typeof fallbackError === "object" && "status" in fallbackError ? (fallbackError as { status?: unknown }).status : null,
     googleStatus: fallbackError && typeof fallbackError === "object" && "googleStatus" in fallbackError ? (fallbackError as { googleStatus?: unknown }).googleStatus : null,
    });
    throw fallbackError;
   }
  }
  logGoogleAdsErrorDiagnostic("Google Ads campaign status query failed", {
   stage: "google_ads_campaign_status_query",
   provider: "google_ads_api",
   targetCustomerId: input.customerId,
   loginCustomerId: input.loginCustomerId ?? null,
   googleCampaignIds: ids,
   durationMs: durationMs(startedAt),
   syncFailureReason: error instanceof Error ? error.message : "unknown",
   errorName: error instanceof Error ? error.name : "unknown",
   errorStatus: error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : null,
   googleStatus: error && typeof error === "object" && "googleStatus" in error ? (error as { googleStatus?: unknown }).googleStatus : null,
  });
  throw error;
 }
}

export async function fetchGoogleAdsCampaignLocationTargeting(input: {
 accessToken: string;
 customerId: string;
 campaignIds: string[];
 loginCustomerId?: string | null;
 businessId?: string | null;
}) {
 if (!input.campaignIds.length) return [] as GoogleAdsCampaignLocationTargeting[];
 const ids = uniqueStrings(input.campaignIds.map(stripCustomerId).filter(Boolean));
 if (!ids.length) return [] as GoogleAdsCampaignLocationTargeting[];
 const criteriaQuery = `SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.resource_name, campaign_criterion.negative, campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign.id IN (${ids.join(",")})`;
 const criteriaRows = await googleAdsSearchStream(
  input.customerId,
  input.accessToken,
  criteriaQuery,
  input.loginCustomerId ?? undefined,
  { stage: "google_ads_campaign_location_query", requestType: "campaign_locations", businessId: input.businessId ?? null },
 );
 const positiveNegativeQuery = `SELECT campaign.id, campaign.geo_target_type_setting.positive_geo_target_type, campaign.geo_target_type_setting.negative_geo_target_type FROM campaign WHERE campaign.id IN (${ids.join(",")})`;
 const settingRows = await googleAdsSearchStream(
  input.customerId,
  input.accessToken,
  positiveNegativeQuery,
  input.loginCustomerId ?? undefined,
  { stage: "google_ads_campaign_location_settings_query", requestType: "campaign_location_settings", businessId: input.businessId ?? null },
 );
 const geoTargetResources = uniqueStrings(criteriaRows.map((row) => {
  const criterion = row.campaignCriterion as Record<string, unknown> | undefined;
  const location = criterion?.location as Record<string, unknown> | undefined;
  return typeof readGoogleAdsField<unknown>(location, "geoTargetConstant", "geo_target_constant") === "string"
   ? String(readGoogleAdsField<unknown>(location, "geoTargetConstant", "geo_target_constant"))
   : "";
 }).filter(Boolean));
 const geoTargetByResource = new Map<string, GoogleAdsGeoTargetSuggestion>();
 if (geoTargetResources.length) {
  const resourceFilter = geoTargetResources.map((resourceName) => `'${escapeGaqlString(resourceName)}'`).join(",");
  const geoTargetQuery = `SELECT geo_target_constant.resource_name, geo_target_constant.id, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.status FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${resourceFilter})`;
  const geoTargetRows = await googleAdsSearchStream(
   input.customerId,
   input.accessToken,
   geoTargetQuery,
   input.loginCustomerId ?? undefined,
   { stage: "google_ads_geo_target_resolution_query", requestType: "geo_target_resolution", businessId: input.businessId ?? null },
  );
  for (const row of geoTargetRows) {
   const target = row.geoTargetConstant as Record<string, unknown> | undefined;
   const resourceName = typeof readGoogleAdsField<unknown>(target, "resourceName", "resource_name") === "string"
    ? String(readGoogleAdsField<unknown>(target, "resourceName", "resource_name"))
    : "";
   if (!resourceName) continue;
   const suggestion = {
    resourceName,
    id: String(readGoogleAdsField<unknown>(target, "id", "id") ?? geoTargetIdFromResourceName(resourceName) ?? ""),
    name: String(readGoogleAdsField<unknown>(target, "name", "name") ?? "Unknown location"),
    canonicalName: typeof readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name") === "string"
     ? String(readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name"))
     : null,
    countryCode: typeof readGoogleAdsField<unknown>(target, "countryCode", "country_code") === "string"
     ? String(readGoogleAdsField<unknown>(target, "countryCode", "country_code"))
     : null,
    targetType: typeof readGoogleAdsField<unknown>(target, "targetType", "target_type") === "string"
     ? String(readGoogleAdsField<unknown>(target, "targetType", "target_type"))
     : null,
    status: typeof readGoogleAdsField<unknown>(target, "status", "status") === "string"
     ? String(readGoogleAdsField<unknown>(target, "status", "status"))
     : null,
    label: formatGeoTargetLabel({
     name: typeof readGoogleAdsField<unknown>(target, "name", "name") === "string" ? String(readGoogleAdsField<unknown>(target, "name", "name")) : null,
     canonicalName: typeof readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name") === "string" ? String(readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name")) : null,
     countryCode: typeof readGoogleAdsField<unknown>(target, "countryCode", "country_code") === "string" ? String(readGoogleAdsField<unknown>(target, "countryCode", "country_code")) : null,
     targetType: typeof readGoogleAdsField<unknown>(target, "targetType", "target_type") === "string" ? String(readGoogleAdsField<unknown>(target, "targetType", "target_type")) : null,
    }),
   } satisfies GoogleAdsGeoTargetSuggestion;
   geoTargetByResource.set(resourceName, suggestion);
  }
 }
 const byCampaign = new Map<string, GoogleAdsCampaignLocationTargeting>();
 for (const campaignId of ids) {
  byCampaign.set(campaignId, {
   campaignId,
   targetedLocations: [],
   excludedLocations: [],
   positiveGeoTargetType: null,
   negativeGeoTargetType: null,
  });
 }
 for (const row of settingRows) {
  const campaign = row.campaign as Record<string, unknown> | undefined;
  const campaignId = String(readGoogleAdsField<unknown>(campaign, "id", "id") ?? "");
  if (!campaignId) continue;
  const target = byCampaign.get(campaignId) ?? {
   campaignId,
   targetedLocations: [],
   excludedLocations: [],
   positiveGeoTargetType: null,
   negativeGeoTargetType: null,
  };
  const setting = readGoogleAdsField<Record<string, unknown> | undefined>(campaign, "geoTargetTypeSetting", "geo_target_type_setting");
  target.positiveGeoTargetType = typeof readGoogleAdsField<unknown>(setting, "positiveGeoTargetType", "positive_geo_target_type") === "string"
   ? String(readGoogleAdsField<unknown>(setting, "positiveGeoTargetType", "positive_geo_target_type"))
   : null;
  target.negativeGeoTargetType = typeof readGoogleAdsField<unknown>(setting, "negativeGeoTargetType", "negative_geo_target_type") === "string"
   ? String(readGoogleAdsField<unknown>(setting, "negativeGeoTargetType", "negative_geo_target_type"))
   : null;
  byCampaign.set(campaignId, target);
 }
 for (const row of criteriaRows) {
  const campaign = row.campaign as Record<string, unknown> | undefined;
  const criterion = row.campaignCriterion as Record<string, unknown> | undefined;
  const location = criterion?.location as Record<string, unknown> | undefined;
  const campaignId = String(readGoogleAdsField<unknown>(campaign, "id", "id") ?? "");
  const geoTargetConstant = typeof readGoogleAdsField<unknown>(location, "geoTargetConstant", "geo_target_constant") === "string"
   ? String(readGoogleAdsField<unknown>(location, "geoTargetConstant", "geo_target_constant"))
   : null;
  if (!campaignId || !geoTargetConstant) continue;
  const target = byCampaign.get(campaignId) ?? {
   campaignId,
   targetedLocations: [],
   excludedLocations: [],
   positiveGeoTargetType: null,
   negativeGeoTargetType: null,
  };
  const resolved = geoTargetByResource.get(geoTargetConstant);
  const criterionId = String(readGoogleAdsField<unknown>(criterion, "criterionId", "criterion_id") ?? "");
  const entry = {
   criterionId,
   criterionResourceName: typeof readGoogleAdsField<unknown>(criterion, "resourceName", "resource_name") === "string"
    ? String(readGoogleAdsField<unknown>(criterion, "resourceName", "resource_name"))
    : null,
   geoTargetConstant,
   geoTargetConstantId: geoTargetIdFromResourceName(geoTargetConstant) ?? "",
   name: resolved?.name ?? "Unknown location",
   canonicalName: resolved?.canonicalName ?? null,
   countryCode: resolved?.countryCode ?? null,
   targetType: resolved?.targetType ?? null,
   label: resolved?.label ?? formatGeoTargetLabel({ name: geoTargetIdFromResourceName(geoTargetConstant), targetType: null }),
   negative: Boolean(readGoogleAdsField<unknown>(criterion, "negative", "negative")),
  } satisfies GoogleAdsCampaignLocation;
  const list = entry.negative ? target.excludedLocations : target.targetedLocations;
  if (!list.some((item) => item.geoTargetConstant === entry.geoTargetConstant)) list.push(entry);
  byCampaign.set(campaignId, target);
 }
 return [...byCampaign.values()];
}

export async function searchGoogleAdsGeoTargets(input: {
 accessToken: string;
 customerId: string;
 query: string;
 loginCustomerId?: string | null;
 businessId?: string | null;
}) {
 const term = normalizeGeoTargetSearchTerm(input.query);
 if (!term) return [] as GoogleAdsGeoTargetSuggestion[];
 const escaped = escapeGaqlString(term);
 const fields = "geo_target_constant.resource_name, geo_target_constant.id, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.status";
 const searchQueries = [
  {
   searchField: "name",
   query: `SELECT ${fields} FROM geo_target_constant WHERE geo_target_constant.status = ENABLED AND geo_target_constant.name LIKE '%${escaped}%' LIMIT 12`,
  },
  {
   searchField: "canonical_name",
   query: `SELECT ${fields} FROM geo_target_constant WHERE geo_target_constant.status = ENABLED AND geo_target_constant.canonical_name LIKE '%${escaped}%' LIMIT 12`,
  },
 ] as const;
 const merged = new Map<string, GoogleAdsGeoTargetSuggestion>();
 for (const search of searchQueries) {
  let rows: Record<string, unknown>[];
  try {
   rows = await googleAdsSearchStream(
    input.customerId,
    input.accessToken,
    search.query,
    input.loginCustomerId ?? undefined,
    { stage: "google_ads_geo_target_search_query", requestType: "geo_target_search", businessId: input.businessId ?? null },
   );
  } catch (error) {
   const requestError = error instanceof GoogleAdsRequestError ? error : null;
   logGoogleAdsErrorDiagnostic("Google Ads geo target search failed", {
    stage: "google_ads_geo_target_search_query",
    provider: "google_ads_api",
    businessId: input.businessId ?? null,
    targetCustomerId: input.customerId,
    loginCustomerId: input.loginCustomerId ?? null,
    searchField: search.searchField,
    sanitizedQuery: search.query,
    httpStatus: requestError?.status ?? null,
    googleStatus: requestError?.googleStatus ?? null,
    requestId: requestError?.requestId ?? null,
    googleErrorCategory: safeGoogleAdsFailurePayload(requestError?.details)[0]?.errorCodeCategory ?? null,
    googleErrorCode: safeGoogleAdsFailurePayload(requestError?.details)[0]?.errorCodeValue ?? null,
   });
   throw error;
  }
  for (const row of rows) {
   const target = row.geoTargetConstant as Record<string, unknown> | undefined;
   const resourceName = typeof readGoogleAdsField<unknown>(target, "resourceName", "resource_name") === "string"
    ? String(readGoogleAdsField<unknown>(target, "resourceName", "resource_name"))
    : "";
   if (!resourceName || merged.has(resourceName)) continue;
   const result = {
    resourceName,
    id: String(readGoogleAdsField<unknown>(target, "id", "id") ?? geoTargetIdFromResourceName(resourceName) ?? ""),
    name: String(readGoogleAdsField<unknown>(target, "name", "name") ?? "Unknown location"),
    canonicalName: typeof readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name") === "string"
     ? String(readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name"))
     : null,
    countryCode: typeof readGoogleAdsField<unknown>(target, "countryCode", "country_code") === "string"
     ? String(readGoogleAdsField<unknown>(target, "countryCode", "country_code"))
     : null,
    targetType: typeof readGoogleAdsField<unknown>(target, "targetType", "target_type") === "string"
     ? String(readGoogleAdsField<unknown>(target, "targetType", "target_type"))
     : null,
    status: typeof readGoogleAdsField<unknown>(target, "status", "status") === "string"
     ? String(readGoogleAdsField<unknown>(target, "status", "status"))
     : null,
    label: formatGeoTargetLabel({
     name: typeof readGoogleAdsField<unknown>(target, "name", "name") === "string" ? String(readGoogleAdsField<unknown>(target, "name", "name")) : null,
     canonicalName: typeof readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name") === "string" ? String(readGoogleAdsField<unknown>(target, "canonicalName", "canonical_name")) : null,
     countryCode: typeof readGoogleAdsField<unknown>(target, "countryCode", "country_code") === "string" ? String(readGoogleAdsField<unknown>(target, "countryCode", "country_code")) : null,
     targetType: typeof readGoogleAdsField<unknown>(target, "targetType", "target_type") === "string" ? String(readGoogleAdsField<unknown>(target, "targetType", "target_type")) : null,
    }),
   } satisfies GoogleAdsGeoTargetSuggestion;
   merged.set(resourceName, result);
  }
 }
 return [...merged.values()].sort((left, right) => {
  const scoreDiff = scoreGeoTargetSuggestion(left, term) - scoreGeoTargetSuggestion(right, term);
  if (scoreDiff) return scoreDiff;
  return left.label.localeCompare(right.label);
 }).slice(0, 12);
}

export async function addGoogleAdsCampaignLocation(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 campaignId: string;
 geoTargetConstant: string;
}) {
 return googleAdsRequestWithLoginFallbacks(`/customers/${stripCustomerId(input.customerId)}/campaignCriteria:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: {
   operations: [{
    create: {
     campaign: `customers/${stripCustomerId(input.customerId)}/campaigns/${stripCustomerId(input.campaignId)}`,
     negative: false,
     location: {
      geoTargetConstant: input.geoTargetConstant,
     },
    },
   }],
  },
 });
}

export async function removeGoogleAdsCampaignLocation(input: {
 accessToken: string;
 customerId: string;
 loginCustomerIds?: Array<string | null | undefined>;
 criterionResourceName: string;
}) {
 return googleAdsRequestWithLoginFallbacks(`/customers/${stripCustomerId(input.customerId)}/campaignCriteria:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: {
   operations: [{
    remove: input.criterionResourceName,
   }],
  },
 });
}

export async function fetchGoogleAdsSearchTerms(input: { accessToken: string; customerId: string; campaignIds: string[]; dateFrom: string; dateTo: string; loginCustomerId?: string | null; businessId?: string | null }) {
 if (!input.campaignIds.length) return [] as GoogleAdsSearchTerm[];
 const ids = input.campaignIds.map((value) => stripCustomerId(value)).filter(Boolean).join(",");
 const dateFilter = googleAdsCustomDateRangeFilter(input.dateFrom, input.dateTo);
 const results = await googleAdsSearchStream(
  input.customerId,
  input.accessToken,
  `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions, metrics.cost_micros FROM search_term_view WHERE campaign.id IN (${ids}) AND ${dateFilter}`,
  input.loginCustomerId,
  { stage: "google_ads_search_terms_query", requestType: "search_terms", businessId: input.businessId ?? null },
 );
 return results.map((row) => {
  const campaign = row.campaign as Record<string, unknown> | undefined;
  const adGroup = row.adGroup as Record<string, unknown> | undefined;
  const metrics = row.metrics as Record<string, unknown> | undefined;
  const searchTermView = row.searchTermView as Record<string, unknown> | undefined;
  return {
   campaignId: String(campaign?.id ?? ""),
   campaignName: typeof campaign?.name === "string" ? campaign.name : null,
   adGroupId: adGroup?.id ? String(adGroup.id) : null,
   adGroupName: typeof adGroup?.name === "string" ? adGroup.name : null,
   term: String(searchTermView?.searchTerm ?? ""),
   impressions: safeNumber(metrics?.impressions),
   clicks: safeNumber(metrics?.clicks),
   ctr: safeNumber(metrics?.ctr),
   conversions: safeNumber(metrics?.conversions),
   costMicros: safeNumber(metrics?.costMicros),
  } satisfies GoogleAdsSearchTerm;
}).filter((row) => row.campaignId && row.term);
}

export async function fetchGoogleAdsAdGroupTotals(input: { accessToken: string; customerId: string; campaignIds: string[]; dateFrom: string; dateTo: string; loginCustomerId?: string | null; businessId?: string | null }) {
 if (!input.campaignIds.length) return [] as GoogleAdsAdGroupTotal[];
 const ids = input.campaignIds.map((value) => stripCustomerId(value)).filter(Boolean).join(",");
 const dateFilter = googleAdsCustomDateRangeFilter(input.dateFrom, input.dateTo);
 const results = await googleAdsSearchStream(
  input.customerId,
  input.accessToken,
  `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions, metrics.cost_micros FROM ad_group WHERE campaign.id IN (${ids}) AND ${dateFilter}`,
  input.loginCustomerId,
  { stage: "google_ads_ad_group_totals_query", requestType: "ad_group_totals", businessId: input.businessId ?? null },
 );
 return results.map((row) => {
  const campaign = row.campaign as Record<string, unknown> | undefined;
  const adGroup = row.adGroup as Record<string, unknown> | undefined;
  const metrics = row.metrics as Record<string, unknown> | undefined;
  return {
   campaignId: String(campaign?.id ?? ""),
   campaignName: typeof campaign?.name === "string" ? campaign.name : null,
   adGroupId: String(adGroup?.id ?? ""),
   adGroupName: typeof adGroup?.name === "string" ? adGroup.name : null,
   impressions: safeNumber(metrics?.impressions),
   clicks: safeNumber(metrics?.clicks),
   ctr: safeNumber(metrics?.ctr),
   conversions: safeNumber(metrics?.conversions),
   costMicros: safeNumber(metrics?.costMicros),
  } satisfies GoogleAdsAdGroupTotal;
 }).filter((row) => row.campaignId && row.adGroupId);
}

export async function fetchGoogleAdsCampaignAdGroupDetails(input: { accessToken: string; customerId: string; campaignId: string; dateFrom: string; dateTo: string; loginCustomerId?: string | null; businessId?: string | null }) {
 const campaignId = stripCustomerId(input.campaignId);
 if (!campaignId) return [] as GoogleAdsCampaignAdGroupDetail[];
 const dateFilter = googleAdsCustomDateRangeFilter(input.dateFrom, input.dateTo);
 const [adGroupRows, keywordRows, adRows] = await Promise.all([
  googleAdsSearchStream(input.customerId, input.accessToken, `SELECT campaign.id, campaign.bidding_strategy_type, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions, metrics.cost_micros FROM ad_group WHERE campaign.id = ${campaignId} AND ${dateFilter}`, input.loginCustomerId, { stage: "google_ads_campaign_ad_groups_query", requestType: "campaign_ad_groups", businessId: input.businessId ?? null }),
  googleAdsSearchStream(input.customerId, input.accessToken, `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM keyword_view WHERE campaign.id = ${campaignId} AND ${dateFilter}`, input.loginCustomerId, { stage: "google_ads_campaign_ad_group_keywords_query", requestType: "campaign_ad_group_keywords", businessId: input.businessId ?? null }),
  googleAdsSearchStream(input.customerId, input.accessToken, `SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE campaign.id = ${campaignId}`, input.loginCustomerId, { stage: "google_ads_campaign_ad_group_ads_query", requestType: "campaign_ad_group_ads", businessId: input.businessId ?? null }),
 ]);
 const details = new Map<string, GoogleAdsCampaignAdGroupDetail>();
 for (const row of adGroupRows) {
  const adGroup = row.adGroup as Record<string, unknown> | undefined;
  const metrics = row.metrics as Record<string, unknown> | undefined;
  const adGroupId = stripCustomerId(String(adGroup?.id ?? ""));
  if (!adGroupId) continue;
  details.set(adGroupId, {
   campaignId,
   biddingStrategyType: typeof readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type") === "string" ? String(readGoogleAdsField(row, "campaign.biddingStrategyType", "campaign.bidding_strategy_type")) : null,
   adGroupId,
   adGroupName: typeof adGroup?.name === "string" ? adGroup.name : null,
   status: typeof adGroup?.status === "string" ? adGroup.status : null,
   cpcBidMicros: safeNumber(adGroup?.cpcBidMicros),
   impressions: safeNumber(metrics?.impressions),
   clicks: safeNumber(metrics?.clicks),
   ctr: safeNumber(metrics?.ctr),
   conversions: safeNumber(metrics?.conversions),
   costMicros: safeNumber(metrics?.costMicros),
   keywords: [],
   ads: [],
  });
 }
 for (const row of keywordRows) {
  const adGroup = row.adGroup as Record<string, unknown> | undefined;
  const criterion = row.adGroupCriterion as Record<string, unknown> | undefined;
  const keyword = criterion?.keyword as Record<string, unknown> | undefined;
  const metrics = row.metrics as Record<string, unknown> | undefined;
  const adGroupId = stripCustomerId(String(adGroup?.id ?? ""));
  const detail = details.get(adGroupId);
  if (!detail) continue;
  detail.keywords.push({
   id: stripCustomerId(String(criterion?.criterionId ?? criterion?.criterion_id ?? "")),
   adGroupId,
   text: typeof keyword?.text === "string" ? keyword.text : "",
   matchType: typeof keyword?.matchType === "string" ? keyword.matchType : null,
   status: typeof criterion?.status === "string" ? criterion.status : null,
   negative: Boolean(criterion?.negative),
   cpcBidMicros: safeNumber(criterion?.cpcBidMicros),
   impressions: safeNumber(metrics?.impressions),
   clicks: safeNumber(metrics?.clicks),
   conversions: safeNumber(metrics?.conversions),
  });
 }
 for (const row of adRows) {
  const adGroup = row.adGroup as Record<string, unknown> | undefined;
  const adGroupAd = row.adGroupAd as Record<string, unknown> | undefined;
  const ad = adGroupAd?.ad as Record<string, unknown> | undefined;
  const responsive = ad?.responsiveSearchAd as Record<string, unknown> | undefined;
  const adGroupId = stripCustomerId(String(adGroup?.id ?? ""));
  const detail = details.get(adGroupId);
  if (!detail) continue;
  detail.ads.push({
   id: stripCustomerId(String(ad?.id ?? "")),
   adGroupId,
   status: typeof adGroupAd?.status === "string" ? adGroupAd.status : null,
   finalUrls: Array.isArray(ad?.finalUrls) ? ad.finalUrls.map(String) : Array.isArray(ad?.final_urls) ? (ad.final_urls as unknown[]).map(String) : [],
   headlines: Array.isArray(responsive?.headlines) ? (responsive.headlines as Array<{ text?: unknown }>).map((entry) => typeof entry?.text === "string" ? entry.text : "").filter(Boolean) : [],
   descriptions: Array.isArray(responsive?.descriptions) ? (responsive.descriptions as Array<{ text?: unknown }>).map((entry) => typeof entry?.text === "string" ? entry.text : "").filter(Boolean) : [],
  });
 }
 return [...details.values()];
}

export async function fetchGoogleAdsAdGroupNegativeKeywords(input: { accessToken: string; customerId: string; campaignId: string; loginCustomerId?: string | null; businessId?: string | null }) {
 const rows = await googleAdsSearchStream(input.customerId, input.accessToken,
  `SELECT ad_group.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.id = ${stripCustomerId(input.campaignId)} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = TRUE`,
  input.loginCustomerId, { stage: "google_ads_negative_keywords_query", requestType: "negative_keywords", businessId: input.businessId ?? null });
 return rows.map((row) => {
  const criterion = row.adGroupCriterion as Record<string, any> | undefined;
  const keyword = criterion?.keyword as Record<string, unknown> | undefined;
  const adGroup = row.adGroup as Record<string, unknown> | undefined;
  return { adGroupId: adGroup?.id ? String(adGroup.id) : "", text: typeof keyword?.text === "string" ? keyword.text : "", matchType: typeof keyword?.matchType === "string" ? keyword.matchType : null };
 }).filter((value) => value.adGroupId && value.text);
}

export async function appendGoogleAdsNegativeKeyword(input: { accessToken: string; customerId: string; adGroupId: string; keyword: string; matchType?: "EXACT" | "PHRASE" | "BROAD"; loginCustomerIds?: Array<string | null | undefined> }) {
 const result = await googleAdsRequestWithLoginFallbacks<{ results?: Array<{ resourceName?: string }>; partialFailureError?: { message?: string } }>(`/customers/${stripCustomerId(input.customerId)}/adGroupCriteria:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: {
   operations: [{
    create: {
     adGroup: `customers/${stripCustomerId(input.customerId)}/adGroups/${stripCustomerId(input.adGroupId)}`,
     negative: true,
     keyword: { text: input.keyword.trim(), matchType: input.matchType ?? "PHRASE" },
    },
   }],
  },
 });
 if (result.partialFailureError?.message) throw new Error(`Google Ads rejected the negative keyword: ${result.partialFailureError.message}`);
 if (!result.results?.length) throw new Error("Google Ads did not confirm the negative keyword.");
 return result;
}

export async function appendGoogleAdsExactMatchKeywords(input: { accessToken: string; customerId: string; keywords: Array<{ adGroupId: string; text: string }>; loginCustomerIds?: Array<string | null | undefined> }) {
 const customerId = stripCustomerId(input.customerId);
 const keywords = input.keywords.map((keyword) => ({ adGroupId: stripCustomerId(keyword.adGroupId), text: keyword.text.trim() })).filter((keyword) => keyword.adGroupId && keyword.text);
 if (!keywords.length) throw new Error("Select at least one keyword to add as exact match.");
 const result = await googleAdsRequestWithLoginFallbacks<{ results?: Array<{ resourceName?: string }>; partialFailureError?: { message?: string } }>(`/customers/${customerId}/adGroupCriteria:mutate`, {
  accessToken: input.accessToken,
  targetCustomerId: input.customerId,
  loginCustomerIds: [...(input.loginCustomerIds ?? []), null],
  body: { operations: keywords.map((keyword) => ({ create: { adGroup: `customers/${customerId}/adGroups/${keyword.adGroupId}`, keyword: { text: keyword.text, matchType: "EXACT" } } })), partialFailure: false },
 });
 if (result.partialFailureError?.message) throw new Error(`Google Ads rejected the exact-match keywords: ${result.partialFailureError.message}`);
 if ((result.results?.length ?? 0) !== keywords.length) throw new Error("Google Ads did not confirm every exact-match keyword.");
 return result;
}

export async function reviewGoogleAdsSearchTermsWithAi(input: { businessId: string; googleCustomerId: string; snapshot: GoogleAdsSearchTermReviewSnapshot; snapshotHash: string }) {
 const apiKey = process.env.OPENAI_API_KEY?.trim();
 const model = process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini";
 const metadata = { businessId: input.businessId, googleCustomerId: input.googleCustomerId, googleCampaignId: input.snapshot.campaign.id, snapshotHash: input.snapshotHash, searchTermCount: input.snapshot.terms.length, model };
 logGoogleAdsKeywordReviewStage("google_ads_search_term_review_started", metadata);
 if (!apiKey || !input.snapshot.terms.length) return null as GoogleAdsSearchTermReview | null;
 try {
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "google_ads_search_term_review", strict: true, schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string" }, terms: { type: "array", items: { type: "object", additionalProperties: false, properties: { searchTerm: { type: "string" }, classification: { type: "string", enum: ["STRONG_MATCH", "RELEVANT", "WATCH", "CONSIDER_EXCLUDING"] }, confidence: { type: "string", enum: ["high", "medium", "low"] }, reason: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, suggestedNegativeMatchType: { type: ["string", "null"], enum: ["EXACT", "PHRASE", "BROAD", null] }, canApplyInServonas: { type: "boolean" } }, required: ["searchTerm", "classification", "confidence", "reason", "evidence", "suggestedNegativeMatchType", "canApplyInServonas"] } } }, required: ["summary", "terms"] } } }, messages: [{ role: "system", content: "You review actual Google Ads search terms for a small service business. Use only supplied facts; do not invent Google data. Classify each supplied search term as STRONG_MATCH, RELEVANT, WATCH, or CONSIDER_EXCLUDING based on commercial intent, business relevance, and performance when sufficient. A clearly relevant service-intent term with zero conversions in early data must not be excluded solely for that reason. Only recommend exclusion for meaningful intent mismatch, such as purchase, job, repair, free, DIY, used, wholesale, or unrelated intent. Keep Google facts separate from your opinion, explain in plain language, never use raw IDs, never guarantee performance, and use PHRASE as the default suggested exclusion match type." }, { role: "user", content: JSON.stringify(input.snapshot) }] }) });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
  const parsed = JSON.parse(String((await response.json() as any).choices?.[0]?.message?.content ?? "{}"));
  const allowed = new Set(input.snapshot.terms.map((term) => normalizeGoogleAdsNegativeKeyword(term.term)));
  const classifications = new Set<GoogleAdsSearchTermClassification>(["STRONG_MATCH", "RELEVANT", "WATCH", "CONSIDER_EXCLUDING"]);
  const confidence = new Set(["high", "medium", "low"]);
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.terms) || parsed.terms.some((term: any) => !term || typeof term.searchTerm !== "string" || !allowed.has(normalizeGoogleAdsNegativeKeyword(term.searchTerm)) || !classifications.has(term.classification) || !confidence.has(term.confidence) || typeof term.reason !== "string" || !Array.isArray(term.evidence) || term.evidence.some((item: unknown) => typeof item !== "string") || !["EXACT", "PHRASE", "BROAD", null].includes(term.suggestedNegativeMatchType) || typeof term.canApplyInServonas !== "boolean")) throw new Error("Malformed search-term review response.");
  const seen = new Set<string>();
  const terms = parsed.terms.filter((term: any) => { const key = normalizeGoogleAdsNegativeKeyword(term.searchTerm); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, input.snapshot.terms.length).map((term: any) => ({ searchTerm: term.searchTerm.trim().slice(0, 160), classification: term.classification, confidence: term.confidence, reason: term.reason.slice(0, 500), evidence: term.evidence.slice(0, 4).map((item: string) => item.slice(0, 160)), suggestedNegativeMatchType: term.classification === "CONSIDER_EXCLUDING" ? (term.suggestedNegativeMatchType ?? "PHRASE") : null, canApplyInServonas: term.classification === "CONSIDER_EXCLUDING" && Boolean(term.canApplyInServonas) }));
  const review = { summary: parsed.summary.slice(0, 500), terms } satisfies GoogleAdsSearchTermReview;
  logGoogleAdsKeywordReviewStage("google_ads_search_term_review_completed", { ...metadata, classificationCounts: Object.fromEntries([...classifications].map((state) => [state, terms.filter((term: { classification: GoogleAdsSearchTermClassification }) => term.classification === state).length])) });
  return review;
 } catch (error) {
  logGoogleAdsKeywordReviewStage("google_ads_search_term_review_failed", { ...metadata, errorType: error instanceof Error ? error.name : "unknown" });
  return null;
 }
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
