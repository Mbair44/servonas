import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import {
 buildGoogleAdsCampaignHealth,
 fetchGoogleAdsCampaignHealthSnapshots,
 fetchGoogleAdsCampaignLocationTargeting,
 fetchGoogleAdsCampaignStatuses,
 fetchGoogleAdsCampaignMetrics,
 fetchGoogleAdsAdGroupTotals,
 fetchGoogleAdsCampaignAdGroupDetails,
  fetchGoogleAdsSearchTerms,
  checkGoogleAdsBusinessIssues,
  googleAdsRecommendedLandingPages,
  logGoogleAdsKeywordReviewStage,
  googleAdsReadyLabel,
  loadTenantGoogleAdsAccess,
  recordGoogleAdsBetaEvent,
  runGoogleAdsPermissionDiagnostic,
  type GoogleAdsCustomer,
} from "@/lib/googleAdsManagement";
import {
 addGoogleAdsNegativeKeywordAction,
 applyRecommendedGoogleAdsSettingsAction,
 applyGoogleAdsKeywordBidRecommendationAction,
 applyGoogleAdsExactMatchRecommendationAction,
 createGoogleAdsDraftAction,
 checkGoogleAdsStatusAction,
 createGoogleAdsAdGroupAction,
 disconnectGoogleAds,
 markGoogleAdsBillingReadyAction,
 publishGoogleAdsDraftAction,
 refreshGoogleAdsAccountsAction,
 refreshGoogleAdsCampaignsAction,
 runGoogleAdsPermissionDiagnosticAction,
 reviewGoogleAdsKeywordsAction,
 selectGoogleAdsCustomer,
 setGoogleAdsCampaignStatusAction,
 submitGoogleAdsBetaFeedbackAction,
 updateGoogleAdsBudgetAction,
 updateGoogleAdsDraftAction,
} from "./actions";
import { GoogleAdsDraftSubmit } from "@/components/GoogleAdsDraftSubmit";
import { GoogleAdsManageCampaignControls } from "@/components/GoogleAdsManageCampaignControls";
import { GoogleAdsLocationManager } from "@/components/GoogleAdsLocationManager";
import { GoogleAdsPageLoadingOverlay } from "@/components/GoogleAdsPageLoadingOverlay";
import { GoogleAdsOauthLauncher } from "@/components/GoogleAdsOauthLauncher";
import { GoogleAdsBidAdjustment } from "@/components/GoogleAdsBidAdjustment";
import { GoogleAdsSearchTermsWorkspace } from "@/components/GoogleAdsSearchTermsWorkspace";
import { GoogleAdsExactMatchKeywordReview } from "@/components/GoogleAdsExactMatchKeywordReview";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const microsToMoney = (micros: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(micros / 1_000_000);
const validDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const monthStart = (value: string) => `${value.slice(0, 8)}01`;
const relativeMinutes = 60_000;
const relativeHours = 60 * relativeMinutes;
const relativeDays = 24 * relativeHours;

async function logGoogleAdsPageGet<T extends { data?: unknown; error?: { code?: string; message?: string; status?: number } | null }>(input: { businessId: string; stage: string; endpointPath: string; requestType: string }, request: PromiseLike<T>) {
 const startedAt = Date.now();
 const result = await request;
 const error = result.error ?? null;
 const payload = {
  provider: "supabase",
  endpointHost: "supabase",
  endpointPath: input.endpointPath,
  stage: input.stage,
  requestType: input.requestType,
  httpStatus: error ? Number(error.status) || 400 : 200,
  durationMs: Date.now() - startedAt,
  businessId: input.businessId,
  ...(error ? { errorCode: error.code ?? null, errorMessage: error.message ?? null } : {}),
 };
 if (error) console.error("google_ads_page_external_get_failed", payload);
 else console.info("google_ads_page_external_get_completed", payload);
 return result;
}

function items(value: unknown) {
 return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

type KeywordDisplay = { id: string; text: string; matchType: string | null; status: string | null; primaryStatus: string | null; primaryStatusReasons: string[]; negative: boolean; cpcBidMicros: number | null; impressions: number; clicks: number; conversions: number; adGroupId: string | null };

const friendlyKeywordValue = (value: string | null) => value ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not reported";
const singularOrPlural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const unresolvedKeyword: KeywordDisplay = { id: "", text: "A reviewed keyword", matchType: null, status: null, primaryStatus: null, primaryStatusReasons: [], negative: false, cpcBidMicros: null, impressions: 0, clicks: 0, conversions: 0, adGroupId: null };

function customerFacingText(value: string, displays: KeywordDisplay[]) {
 let result = value;
 for (const display of displays) {
  if (display.id) result = result.replaceAll(display.id, display.text);
 }
 return result.replace(/\b\d{6,}\b/g, "a reviewed keyword");
}

function readableRecommendationEvidence(category: string | undefined, displays: KeywordDisplay[]) {
 if (!displays.length) return ["Servonas could not match every saved keyword to its display details. No automatic change will be made."];
 const negative = displays.filter((keyword) => keyword.negative);
 if (category === "negative_keyword" && negative.length) {
  const inactive = negative.filter((keyword) => keyword.impressions === 0 && keyword.clicks === 0).length;
  return [inactive === negative.length ? `${singularOrPlural(negative.length, "reviewed negative keyword")} have not received impressions or clicks.` : `${singularOrPlural(inactive, "reviewed negative keyword")} have not received impressions or clicks.`, "No issues were detected with the current negative keyword set."];
 }
 const limited = displays.filter((keyword) => keyword.primaryStatus === "LIMITED").length;
 const impressions = displays.reduce((total, keyword) => total + keyword.impressions, 0);
 const clicks = displays.reduce((total, keyword) => total + keyword.clicks, 0);
 const conversions = displays.reduce((total, keyword) => total + keyword.conversions, 0);
 const facts = [limited ? `${singularOrPlural(limited, "reviewed keyword")} are currently limited by Google.` : `${singularOrPlural(displays.length, "reviewed keyword")} are active in this review.`, `Google reports ${impressions} impressions, ${clicks} clicks, and ${conversions} conversions across these reviewed keywords.`];
 const bids = displays.filter((keyword) => keyword.cpcBidMicros !== null).slice(0, 3).map((keyword) => `${keyword.text}: ${microsToMoney(keyword.cpcBidMicros!)}`);
 if (bids.length) facts.push(`Current maximum bids: ${bids.join(", ")}.`);
 return facts;
}

function recommendedKeywordReviewAction(category: string | undefined, keywords: KeywordDisplay[]) {
 const names = keywords.filter((keyword) => keyword.text !== unresolvedKeyword.text).map((keyword) => keyword.text).slice(0, 3);
 const listed = names.length ? ` for ${names.join(", ")}` : "";
 if (category === "bid") return "Review the proposed bid change below before applying it. Servonas will not change your daily budget.";
 if (category === "match_type") return `Add exact-match versions${listed} after confirming the search terms are high intent. Keep the existing phrase-match keywords in place while results are still limited.`;
 if (category === "add_keyword") return `Review the suggested new keywords${listed} and add only terms that clearly describe a service you offer.`;
 if (category === "pause_keyword") return `Review the affected keywords${listed} before pausing them. Do not pause a keyword solely because it has little early data.`;
 if (category === "negative_keyword") return "Keep the current negative keywords unless search-term data shows they are blocking relevant customer searches.";
 if (category === "budget") return "Review your daily budget alongside actual conversions before increasing spend.";
 if (category === "conversion_tracking") return "Set up a tracked booking, lead, or phone-call outcome before using conversion-based performance recommendations.";
 if (category === "keep_keyword") return "Keep these keywords active and collect more data before making a change.";
 return "Review the supporting Google data and make a change only if it fits your business goals.";
}

function keywordReview(value: unknown) {
 if (!value || typeof value !== "object") return null;
 const review = (value as { review?: unknown }).review;
 if (!review || typeof review !== "object") return null;
 const candidate = review as { summary?: unknown; performanceDataState?: unknown; keywordsReviewed?: unknown; recommendations?: unknown };
 if (typeof candidate.summary !== "string" || !Array.isArray(candidate.recommendations)) return null;
 const labels = Array.isArray((value as { keywordLabels?: unknown }).keywordLabels) ? (value as { keywordLabels: unknown[] }).keywordLabels.flatMap((entry) => entry && typeof entry === "object" && typeof (entry as any).id === "string" && typeof (entry as any).text === "string" ? [{ id: (entry as any).id, text: (entry as any).text }] : []) : [];
 const keywordDisplays = Array.isArray((value as { keywordDisplays?: unknown }).keywordDisplays) ? (value as { keywordDisplays: unknown[] }).keywordDisplays.flatMap((entry): KeywordDisplay[] => entry && typeof entry === "object" && typeof (entry as any).id === "string" && typeof (entry as any).text === "string" ? [{ id: (entry as any).id, text: (entry as any).text, matchType: typeof (entry as any).matchType === "string" ? (entry as any).matchType : null, status: typeof (entry as any).status === "string" ? (entry as any).status : null, primaryStatus: typeof (entry as any).primaryStatus === "string" ? (entry as any).primaryStatus : null, primaryStatusReasons: Array.isArray((entry as any).primaryStatusReasons) ? (entry as any).primaryStatusReasons.filter((reason: unknown): reason is string => typeof reason === "string") : [], negative: Boolean((entry as any).negative), cpcBidMicros: typeof (entry as any).cpcBidMicros === "number" ? (entry as any).cpcBidMicros : null, impressions: Number((entry as any).impressions) || 0, clicks: Number((entry as any).clicks) || 0, conversions: Number((entry as any).conversions) || 0, adGroupId: typeof (entry as any).adGroupId === "string" ? (entry as any).adGroupId : null }] : []) : labels.map((label) => ({ ...unresolvedKeyword, ...label }));
 const bidRecommendations = Array.isArray((value as { bidRecommendations?: unknown }).bidRecommendations) ? (value as { bidRecommendations: unknown[] }).bidRecommendations.filter((entry): entry is { keywordId: string; keyword: string; currentBidMicros: number; firstPageBidEstimateMicros: number; recommendedBidMicros: number; increasePercent: number; reason: string } => Boolean(entry && typeof entry === "object" && typeof (entry as any).keywordId === "string" && typeof (entry as any).currentBidMicros === "number" && typeof (entry as any).recommendedBidMicros === "number")) : [];
 const bidContextValue = (value as { bidActionContext?: unknown }).bidActionContext;
 const bidActionContext = bidContextValue && typeof bidContextValue === "object" ? bidContextValue as { biddingStrategy?: string | null; dailyBudgetMicros?: number | null; defaultBidMicros?: number | null; suggestedDefaultBidMicros?: number | null; keywordCandidates?: Array<{ keywordId: string; keyword: string; currentBidMicros: number; suggestedBidMicros: number; status?: string | null; reasons?: string[] }> } : null;
 return {
  summary: candidate.summary,
  snapshotHash: typeof (value as { snapshotHash?: unknown }).snapshotHash === "string" ? (value as { snapshotHash: string }).snapshotHash : null,
  model: typeof (value as { model?: unknown }).model === "string" ? (value as { model: string }).model : null,
  keywordCount: typeof (value as { keywordCount?: unknown }).keywordCount === "number" ? (value as { keywordCount: number }).keywordCount : labels.length,
  snapshotTimestamp: typeof (value as { generatedAt?: unknown }).generatedAt === "string" ? (value as { generatedAt: string }).generatedAt : null,
  performanceDataState: candidate.performanceDataState === "early" ? "early" : "sufficient",
  keywordsReviewed: typeof candidate.keywordsReviewed === "number" ? candidate.keywordsReviewed : labels.length,
  keywordLabels: new Map(labels.map((label) => [label.id, label.text])),
  keywordDisplays: new Map(keywordDisplays.map((display) => [display.id, display])),
  bidRecommendations,
  bidActionContext,
  recommendations: candidate.recommendations.filter((entry): entry is { id: string; category?: string; actionType?: "adjust_default_bid" | "adjust_keyword_bid" | "pause_keywords" | "add_keywords" | "add_negative_keywords" | "change_match_type" | "review_only"; suggestedDirection?: "increase" | "decrease" | "review" | null; priority: string; title: string; explanation: string; evidence: string[]; suggestedValue: { label?: string; value?: string | null } | null; keywordIds: string[]; canApplyInServonas?: boolean } => Boolean(entry && typeof entry === "object" && typeof (entry as any).title === "string")).slice(0, 5),
 };
}

function searchTermReview(value: unknown) {
 if (!value || typeof value !== "object") return null;
 const record = value as any; const review = record.review;
 if (!review || typeof review.summary !== "string" || !Array.isArray(review.terms)) return null;
 const terms = review.terms.filter((term: any) => term && typeof term.searchTerm === "string" && ["STRONG_MATCH", "RELEVANT", "WATCH", "CONSIDER_EXCLUDING"].includes(term.classification) && ["high", "medium", "low"].includes(term.confidence) && typeof term.reason === "string" && Array.isArray(term.evidence)).map((term: any) => ({ searchTerm: term.searchTerm, classification: term.classification, confidence: term.confidence, reason: term.reason, evidence: term.evidence.filter((item: unknown) => typeof item === "string"), suggestedNegativeMatchType: ["EXACT", "PHRASE", "BROAD"].includes(term.suggestedNegativeMatchType) ? term.suggestedNegativeMatchType : null, canApplyInServonas: Boolean(term.canApplyInServonas) }));
 return terms.length || review.terms.length === 0 ? { summary: review.summary, terms, createdAt: typeof record.generatedAt === "string" ? record.generatedAt : null, dateFrom: typeof record.dateFrom === "string" ? record.dateFrom : null, dateTo: typeof record.dateTo === "string" ? record.dateTo : null, negatives: Array.isArray(record.negatives) ? record.negatives.map((item: any) => typeof item?.text === "string" ? item.text : "").filter(Boolean) : [] } : null;
}

const recommendationBadge = (category: string | null | undefined) => {
 if (category === "bid") return "Review bid recommendations";
 if (category === "pause_keyword") return "Review keywords";
 if (category === "add_keyword") return "View suggestions";
 if (category === "negative_keyword") return "Review negatives";
 if (category === "match_type") return "Review match types";
 return "Review recommendation";
};

const billingUrl = (customerId: string | null | undefined) =>
 customerId ? `https://ads.google.com/aw/billing/summary?ocid=${encodeURIComponent(customerId)}` : "https://ads.google.com/home/";

const accountCreateUrl = "https://ads.google.com/home/";
const industryLabel = (value: string | null | undefined) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Business";
const dailyBudgetLabel = (micros: number | string | null | undefined) => `${microsToMoney(Number(micros ?? 0))}/day`;
const friendlyGeoTargetType = (value: string | null | undefined) => value ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
const usStateAbbreviations: Record<string, string> = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY" };
const friendlyLocationName = (value: string | null | undefined) => {
 if (!value) return "Unknown location";
 const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
 if (parts.at(-1) === "United States") parts.pop();
 const state = parts.at(-1);
 if (state && usStateAbbreviations[state]) parts[parts.length - 1] = usStateAbbreviations[state];
 return parts.join(", ");
};
const campaignLocationSummary = (locations: Array<{ canonicalName: string | null; name: string }>) => {
 if (!locations.length) return "No locations set";
 const names = locations.map((location) => friendlyLocationName(location.canonicalName || location.name));
 if (names.length <= 2) return names.join(" · ");
 return `${names.slice(0, 2).join(" · ")} · +${names.length - 2} more`;
};
const friendlyGoogleCampaignStatus = (status: string | null | undefined) => {
 if (status === "ENABLED") return "Published — Active";
 if (status === "PAUSED") return "Published — Paused";
 if (status === "REMOVED") return "Removed";
 return "Published";
};
const friendlyPrimaryStatus = (status: string | null | undefined) => status ? status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
const friendlyIssue = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatTimestamp = (value: string | null | undefined, timeZone?: string | null) => {
 if (!value) return { relative: "Not synced yet", absolute: null };
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return { relative: "Not synced yet", absolute: null };
 const delta = Date.now() - date.getTime();
 let relative = "Just now";
 if (delta >= relativeDays) relative = `${Math.round(delta / relativeDays)} day${Math.round(delta / relativeDays) === 1 ? "" : "s"} ago`;
 else if (delta >= relativeHours) relative = `${Math.round(delta / relativeHours)} hour${Math.round(delta / relativeHours) === 1 ? "" : "s"} ago`;
 else if (delta >= relativeMinutes) relative = `${Math.round(delta / relativeMinutes)} min ago`;
 const formatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: timeZone || undefined,
  timeZoneName: "short",
 });
 return {
  relative,
  absolute: formatter.format(date),
 };
};

type CampaignMetricRow = Awaited<ReturnType<typeof fetchGoogleAdsCampaignMetrics>>[number];
type CampaignStatusRow = Awaited<ReturnType<typeof fetchGoogleAdsCampaignStatuses>>[number];

type CampaignSummaryTone = "healthy" | "review" | "paused" | "issue" | "warning";
type CampaignSummary = {
 tone: CampaignSummaryTone;
 badge: string;
 headline: string;
 supporting: string;
 technicalStatus: string;
 issueLabel: string;
 performanceHint: string | null;
};

function buildCampaignSummary(input: {
 effectiveGoogleStatus: string | null;
 effectivePrimaryStatus: string | null;
 primaryStatusReasons: string[];
 statusSyncUnavailable: boolean;
 issuesAvailable: boolean;
 hasMetrics: boolean;
}) {
 const issueLabel = input.statusSyncUnavailable
  ? "Status sync unavailable"
  : input.primaryStatusReasons.length
   ? input.primaryStatusReasons.map(friendlyIssue).join(", ")
   : !input.issuesAvailable
    ? "Unavailable from Google"
    : "None reported";
 const technicalStatus = `Google status: ${input.effectiveGoogleStatus ?? "Sync unavailable"}${input.effectiveGoogleStatus ? ` • Serving status: ${input.effectivePrimaryStatus ? friendlyPrimaryStatus(input.effectivePrimaryStatus) : "Sync unavailable"}` : ""}`;
 if (input.statusSyncUnavailable) {
  return {
   tone: "warning",
   badge: "Sync unavailable",
   headline: "Campaign is published — status could not be refreshed",
   supporting: "Servonas could not confirm the latest Google Ads status right now. Refresh again to update the live state.",
   technicalStatus,
   issueLabel,
   performanceHint: null,
  } satisfies CampaignSummary;
 }
 if (input.effectiveGoogleStatus === "PAUSED") {
  return {
   tone: "paused",
   badge: "Paused",
   headline: "Campaign is paused",
   supporting: "Google still has the campaign, but it is intentionally not serving until you resume it.",
   technicalStatus,
   issueLabel,
   performanceHint: "Performance data will stay flat while the campaign is paused.",
  } satisfies CampaignSummary;
 }
 if (input.effectiveGoogleStatus === "REMOVED") {
  return {
   tone: "issue",
   badge: "Removed",
   headline: "Campaign was removed from Google Ads",
   supporting: "This campaign is no longer eligible to run. Review the draft or create a new campaign if you want to relaunch.",
   technicalStatus,
   issueLabel,
   performanceHint: null,
  } satisfies CampaignSummary;
 }
 const reasonSet = new Set(input.primaryStatusReasons);
 if (reasonSet.has("MOST_ADS_UNDER_REVIEW") || input.effectivePrimaryStatus === "PENDING") {
  return {
   tone: "review",
   badge: "Pending review",
   headline: "Campaign is on — Google is reviewing your ads",
   supporting: "Your campaign is enabled, but ads will not begin serving until Google finishes reviewing them.",
   technicalStatus,
   issueLabel,
   performanceHint: "Performance data will appear after your ads begin serving.",
  } satisfies CampaignSummary;
 }
 if (input.effectivePrimaryStatus === "ELIGIBLE" && input.effectiveGoogleStatus === "ENABLED") {
  return {
   tone: "healthy",
   badge: "Active",
   headline: "Campaign is active",
   supporting: "Google's serving status and Servonas campaign health are shown separately below.",
   technicalStatus,
   issueLabel,
   performanceHint: input.hasMetrics ? null : "Performance data will appear once the campaign starts collecting activity.",
  } satisfies CampaignSummary;
 }
 if (input.effectivePrimaryStatus === "LIMITED") {
  return {
   tone: "review",
   badge: "Limited",
   headline: "Campaign is on, but delivery is limited",
   supporting: "Google can see the campaign, but something is limiting how often it can serve.",
   technicalStatus,
   issueLabel,
   performanceHint: input.hasMetrics ? null : "Performance data may stay light until the limitation is cleared.",
  } satisfies CampaignSummary;
 }
 return {
  tone: "issue",
  badge: "Needs attention",
  headline: "Campaign needs attention before it can fully perform",
  supporting: "Review the Google serving state and issue details below to see what is blocking or limiting delivery.",
  technicalStatus,
  issueLabel,
  performanceHint: input.hasMetrics ? null : "Performance data will appear after the campaign becomes eligible to serve.",
 } satisfies CampaignSummary;
}

type CampaignCardViewModel = {
 campaign: any;
 metric: CampaignMetricRow | null;
 effectiveGoogleStatus: string | null;
 effectivePrimaryStatus: string | null;
 primaryStatusReasons: string[];
 statusSyncUnavailable: boolean;
 issuesAvailable: boolean;
 effectiveCardStatus: "published" | "paused" | "issue" | "failed" | "queued" | "removed" | string;
 statusLabel: string;
 summary: CampaignSummary;
};

function buildCampaignViewModels(
 campaigns: any[] | null | undefined,
 metricsByCampaignId: Map<string, CampaignMetricRow>,
 campaignStatusesByCampaignId: Map<string, CampaignStatusRow>,
 campaignLocationsByCampaignId: Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignLocationTargeting>>[number]>,
) {
 return (campaigns ?? []).map((campaign) => {
  const metric = campaign.google_campaign_id ? metricsByCampaignId.get(String(campaign.google_campaign_id)) ?? null : null;
  const googleStatus = campaign.google_campaign_id ? campaignStatusesByCampaignId.get(String(campaign.google_campaign_id)) ?? null : null;
  const effectiveGoogleStatus = googleStatus?.status ?? campaign.google_campaign_status ?? null;
  const effectivePrimaryStatus = googleStatus?.primaryStatus ?? campaign.google_campaign_primary_status ?? null;
  const primaryStatusReasons = Array.isArray(googleStatus?.primaryStatusReasons)
   ? googleStatus.primaryStatusReasons
   : Array.isArray(campaign.google_campaign_primary_status_reasons)
    ? campaign.google_campaign_primary_status_reasons.map(String)
    : [];
  const statusSyncUnavailable = Boolean(campaign.google_campaign_id) && !effectiveGoogleStatus;
  const issuesAvailable = googleStatus?.issuesAvailable !== false;
  const hasIssue = Boolean(
   effectiveGoogleStatus === "REMOVED"
   || (effectivePrimaryStatus && !["ELIGIBLE", "LIMITED"].includes(effectivePrimaryStatus))
   || primaryStatusReasons.length,
  );
  const effectiveCardStatus = !campaign.google_campaign_id
   ? campaign.status
   : effectiveGoogleStatus === "REMOVED"
    ? "removed"
    : hasIssue && effectiveGoogleStatus !== "ENABLED" && effectiveGoogleStatus !== "PAUSED"
     ? "issue"
     : effectiveGoogleStatus === "PAUSED"
      ? "paused"
      : hasIssue
       ? "issue"
       : "published";
  const statusLabel = !campaign.google_campaign_id
   ? campaign.status === "failed"
    ? "Failed"
   : "Draft"
   : effectiveGoogleStatus === "REMOVED"
    ? "Removed"
    : hasIssue && effectiveGoogleStatus !== "ENABLED" && effectiveGoogleStatus !== "PAUSED"
     ? "Published — Has issue"
     : friendlyGoogleCampaignStatus(effectiveGoogleStatus);
  const summary = buildCampaignSummary({
   effectiveGoogleStatus,
   effectivePrimaryStatus,
   primaryStatusReasons,
   statusSyncUnavailable,
   issuesAvailable,
   hasMetrics: Boolean(metric && (metric.impressions || metric.clicks || metric.conversions || metric.costMicros)),
  });
  return {
   campaign,
   metric,
   effectiveGoogleStatus,
   effectivePrimaryStatus,
   primaryStatusReasons,
   statusSyncUnavailable,
   issuesAvailable,
   effectiveCardStatus,
   statusLabel,
   summary,
  } satisfies CampaignCardViewModel;
 });
}

export default async function GoogleAdsPage({
 params,
 searchParams,
}: {
 params: Promise<{ businessSlug: string }>;
 searchParams: Promise<{ from?: string; to?: string; error?: string; success?: string; diagnostic?: string; manageLocations?: string; locationQuery?: string }>;
}) {
 const { businessSlug } = await params;
 const query = await searchParams;
 const { supabase, business, role } = await requireWorkspace(businessSlug);
 const canEdit = canManageBusiness(role);
 const today = new Date().toISOString().slice(0, 10);
 const to = validDate(query.to) ? query.to! : today;
 const from = validDate(query.from) ? query.from! : monthStart(to);
 if (!canEdit) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can manage Google Ads.</div></section></main>;
 await checkGoogleAdsBusinessIssues({ businessId: business.id, businessSlug, freshnessMinutes: 20 }).catch(() => null);

 const [{ data: services }, { data: inventory }, { data: territories }, { data: website }, connectionQuery, { data: campaigns }, { data: adGroups }, { data: auditLog }, { data: betaEvents }, { data: betaFeedback }, { data: marketingIssues }] = await Promise.all([
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_services_read", endpointPath: "services", requestType: "google_ads_page_services_read" }, supabase.from("services").select("id,name,description").eq("business_id", business.id).eq("active", true).eq("is_deleted", false).order("sort_order").order("name")),
  // Inventory enriches offer choices only; it is intentionally independent of Google Ads rendering.
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_inventory_read", endpointPath: "inventory_items", requestType: "google_ads_page_inventory_read" }, supabase.from("inventory_items").select("id,name,description").eq("business_id", business.id).eq("active", true).order("created_at", { ascending: false }).order("name")),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_territories_read", endpointPath: "workforce_territories", requestType: "google_ads_page_territories_read" }, supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name")),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_website_read", endpointPath: "business_website_settings", requestType: "google_ads_page_website_read" }, supabase.from("business_website_settings").select("public_slug,custom_domain,status,domain_status,hero_heading,hero_subheading,about_text").eq("business_id", business.id).maybeSingle()),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_connection_read", endpointPath: "business_google_ads_connections", requestType: "google_ads_connection_page_read" }, supabase.from("business_google_ads_connections").select("google_ads_customer_id,accessible_customer_ids,accessible_customer_labels,status,google_authenticated_email,google_authenticated_name,account_discovery_last_successful_at,account_discovery_last_attempted_at,account_discovery_retry_after_at,account_discovery_last_http_status,account_discovery_last_google_status,account_discovery_last_message,account_discovery_last_request_id,last_issue_check_at,last_issue_check_failed_at,last_issue_check_error").eq("business_id", business.id).maybeSingle()),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_campaigns_read", endpointPath: "business_google_ads_campaigns", requestType: "google_ads_page_campaigns_read" }, supabase.from("business_google_ads_campaigns").select("*").eq("business_id", business.id).order("updated_at", { ascending: false })),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_ad_groups_read", endpointPath: "business_google_ads_ad_groups", requestType: "google_ads_page_ad_groups_read" }, supabase.from("business_google_ads_ad_groups").select("*").eq("business_id", business.id).order("updated_at", { ascending: false })),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_audit_read", endpointPath: "business_google_ads_audit_log", requestType: "google_ads_page_audit_read" }, supabase.from("business_google_ads_audit_log").select("campaign_id,event_type,metadata,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(100)),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_beta_events_read", endpointPath: "business_google_ads_beta_events", requestType: "google_ads_page_beta_events_read" }, supabase.from("business_google_ads_beta_events").select("event_name,metadata,occurred_at").eq("business_id", business.id).order("occurred_at", { ascending: false }).limit(40)),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_feedback_read", endpointPath: "business_google_ads_beta_feedback", requestType: "google_ads_page_feedback_read" }, supabase.from("business_google_ads_beta_feedback").select("rating,feedback,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(5)),
  logGoogleAdsPageGet({ businessId: business.id, stage: "google_ads_page_marketing_issues_read", endpointPath: "business_marketing_issues", requestType: "google_ads_marketing_issues_read" }, supabase.from("business_marketing_issues").select("*").eq("business_id", business.id).eq("provider", "google_ads").eq("status", "active").order("updated_at", { ascending: false })),
 ]);
 const { data: connection, error: connectionQueryError } = connectionQuery;
 if (connectionQueryError) {
  console.error("google_ads_page_dependency_failed", {
   provider: "supabase",
   endpointHost: "supabase",
   endpointPath: "business_google_ads_connections",
   stage: "google_ads_page_connection_read",
   requestType: "google_ads_connection_page_read",
   httpStatus: Number((connectionQueryError as { status?: unknown }).status) || 400,
   businessId: business.id,
   errorCode: connectionQueryError.code,
   errorMessage: connectionQueryError.message,
  });
 }

 let connectionAccess: Awaited<ReturnType<typeof loadTenantGoogleAdsAccess>> | null = null;
 let connectionError: string | null = null;
 let metricsError: string | null = null;
 let statusError: string | null = null;
 let searchTermsError: string | null = null;
 let permissionDiagnostic: Awaited<ReturnType<typeof runGoogleAdsPermissionDiagnostic>> | null = null;
let metricsByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignMetrics>>[number]>();
let campaignStatusesByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignStatuses>>[number]>();
let campaignLocationsByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignLocationTargeting>>[number]>();
let campaignHealthSnapshotsByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignHealthSnapshots>>[number]>();
 let adGroupTotalsByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsAdGroupTotals>>>();
 let liveAdGroupDetailsByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignAdGroupDetails>>>();
 let topSearchTerms: Awaited<ReturnType<typeof fetchGoogleAdsSearchTerms>> = [];
 let locationsError: string | null = null;
 let healthError: string | null = null;
 if (connection?.status && connection.status !== "disconnected") {
  try {
   connectionAccess = await loadTenantGoogleAdsAccess(business.id);
   if (connectionAccess?.customerId) {
    const publishedIds = (campaigns ?? []).map((campaign: any) => String(campaign.google_campaign_id ?? "")).filter(Boolean);
    try {
     const metrics = await fetchGoogleAdsCampaignMetrics({
      accessToken: connectionAccess.accessToken,
      customerId: connectionAccess.customerId,
      dateFrom: from,
      dateTo: to,
      businessId: business.id,
     });
     metricsByCampaignId = new Map(metrics.map((row) => [row.campaignId, row]));
    } catch (error) {
     metricsError = error instanceof Error ? error.message : "Campaign metrics could not be loaded.";
    }
    try {
     const campaignStatuses = await fetchGoogleAdsCampaignStatuses({
      accessToken: connectionAccess.accessToken,
      customerId: connectionAccess.customerId,
      campaignIds: publishedIds,
      loginCustomerId: connectionAccess.loginCustomerId,
      businessId: business.id,
     });
     campaignStatusesByCampaignId = new Map(campaignStatuses.map((row) => [row.campaignId, row]));
    } catch (error) {
     statusError = error instanceof Error ? error.message : "Campaign status could not be loaded.";
    }
    try {
     const campaignLocations = await fetchGoogleAdsCampaignLocationTargeting({
      accessToken: connectionAccess.accessToken,
      customerId: connectionAccess.customerId,
      campaignIds: publishedIds,
      loginCustomerId: connectionAccess.loginCustomerId,
      businessId: business.id,
     });
     campaignLocationsByCampaignId = new Map(campaignLocations.map((row) => [row.campaignId, row]));
    } catch (error) {
     locationsError = error instanceof Error ? error.message : "Campaign locations could not be loaded.";
    }
    try {
     const healthSnapshots = await fetchGoogleAdsCampaignHealthSnapshots({
      accessToken: connectionAccess.accessToken,
      customerId: connectionAccess.customerId,
      campaignIds: publishedIds,
      loginCustomerId: connectionAccess.loginCustomerId,
      businessId: business.id,
     });
     campaignHealthSnapshotsByCampaignId = new Map(healthSnapshots.map((row) => [row.campaignId, row]));
    } catch (error) {
     healthError = error instanceof Error ? error.message : "Campaign health details could not be loaded.";
    }
    try {
     const adGroupTotals = await fetchGoogleAdsAdGroupTotals({
      accessToken: connectionAccess.accessToken,
      customerId: connectionAccess.customerId,
      campaignIds: publishedIds,
      dateFrom: from,
      dateTo: to,
      loginCustomerId: connectionAccess.loginCustomerId,
      businessId: business.id,
     });
     adGroupTotalsByCampaignId = new Map(publishedIds.map((id) => [id, adGroupTotals.filter((row) => row.campaignId === id)]));
    } catch {}
    try {
     const liveCustomerId = connectionAccess?.customerId ?? null;
     const liveAccessToken = connectionAccess?.accessToken ?? null;
     const liveLoginCustomerId = connectionAccess?.loginCustomerId ?? null;
     if (liveCustomerId && liveAccessToken) {
      const liveGroups = await Promise.all(publishedIds.map(async (id) => [id, await fetchGoogleAdsCampaignAdGroupDetails({
       accessToken: liveAccessToken,
       customerId: liveCustomerId,
       campaignId: id,
       dateFrom: from,
       dateTo: to,
       loginCustomerId: liveLoginCustomerId,
       businessId: business.id,
      })] as const));
      liveAdGroupDetailsByCampaignId = new Map(liveGroups);
     }
    } catch {}
    try {
     topSearchTerms = await fetchGoogleAdsSearchTerms({
      accessToken: connectionAccess.accessToken,
      customerId: connectionAccess.customerId,
      campaignIds: publishedIds,
      dateFrom: from,
      dateTo: to,
      loginCustomerId: connectionAccess.loginCustomerId,
      businessId: business.id,
     });
    } catch (error) {
     searchTermsError = error instanceof Error ? error.message : "Search terms could not be loaded.";
    }
   }
   if (query.diagnostic === "access") {
    permissionDiagnostic = await runGoogleAdsPermissionDiagnostic({ businessId: business.id });
   }
  } catch (error) {
   connectionError = error instanceof Error ? error.message : "Google Ads access could not be refreshed.";
  }
 }

 const customerChoices: GoogleAdsCustomer[] = connectionAccess?.customerChoices ?? ((connection?.accessible_customer_ids ?? []).map((id: string) => ({
  id,
  label: String((connection?.accessible_customer_labels as Record<string, unknown> | null)?.[id] ?? id),
  loginCustomerId: null,
  managerCustomerId: null,
  isManager: false,
  level: 0,
  status: null,
  source: "direct" as const,
 })));
 const campaignCards = buildCampaignViewModels(campaigns ?? [], metricsByCampaignId, campaignStatusesByCampaignId, campaignLocationsByCampaignId);
 const adGroupsByCampaignId = new Map<string, any[]>();
 for (const adGroup of adGroups ?? []) {
  const current = adGroupsByCampaignId.get(String((adGroup as any).campaign_id)) ?? [];
  current.push(adGroup);
  adGroupsByCampaignId.set(String((adGroup as any).campaign_id), current);
 }
 const keywordReviewsByCampaignId = new Map<string, { review: NonNullable<ReturnType<typeof keywordReview>>; createdAt: string; stale: boolean; appliedKeywordIds: Set<string> }>();
 const latestKeywordReviewStaleAtByCampaignId = new Map<string, string>();
 const appliedKeywordIdsByCampaignId = new Map<string, Set<string>>();
 const servingRelevantEventTypes = new Set(["google_ads_campaign_published", "google_ads_campaign_resumed", "google_ads_max_cpc_updated", "google_ads_budget_updated", "google_ads_campaign_location_added", "google_ads_campaign_location_removed"]);
 const servingRelevantChangeByCampaignId = new Map<string, string>();
 for (const entry of auditLog ?? []) {
  if (entry.campaign_id && servingRelevantEventTypes.has(entry.event_type) && !servingRelevantChangeByCampaignId.has(entry.campaign_id) && !Number.isNaN(new Date(entry.created_at).getTime())) servingRelevantChangeByCampaignId.set(entry.campaign_id, entry.created_at);
  if (entry.event_type === "google_ads_keyword_bid_applied" && entry.campaign_id && entry.metadata && typeof entry.metadata === "object" && typeof (entry.metadata as { keywordId?: unknown }).keywordId === "string") { const applied = appliedKeywordIdsByCampaignId.get(entry.campaign_id) ?? new Set<string>(); applied.add((entry.metadata as { keywordId: string }).keywordId); appliedKeywordIdsByCampaignId.set(entry.campaign_id, applied); }
  if (entry.event_type === "google_ads_keyword_review_stale" && entry.campaign_id && !latestKeywordReviewStaleAtByCampaignId.has(entry.campaign_id)) latestKeywordReviewStaleAtByCampaignId.set(entry.campaign_id, entry.created_at);
  if (entry.event_type !== "google_ads_keyword_review_generated" || !entry.campaign_id || keywordReviewsByCampaignId.has(entry.campaign_id)) continue;
  const review = keywordReview(entry.metadata);
  if (review) keywordReviewsByCampaignId.set(entry.campaign_id, { review, createdAt: entry.created_at, stale: (latestKeywordReviewStaleAtByCampaignId.get(entry.campaign_id) ?? "") > entry.created_at, appliedKeywordIds: appliedKeywordIdsByCampaignId.get(entry.campaign_id) ?? new Set<string>() });
 }
 for (const [campaignId, savedReview] of keywordReviewsByCampaignId) {
  const campaign = (campaigns ?? []).find((entry: any) => entry.id === campaignId);
  logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_cache_checked", { businessId: business.id, googleCustomerId: campaign?.google_ads_customer_id ?? connection?.google_ads_customer_id ?? null, googleCampaignId: campaign?.google_campaign_id ?? null, snapshotHash: savedReview.review.snapshotHash, snapshotTimestamp: savedReview.review.snapshotTimestamp, keywordCount: savedReview.review.keywordCount, model: savedReview.review.model, durationMs: 0, cacheStatus: savedReview.stale ? "stale" : "hit" });
  if (!savedReview.stale) logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_cache_hit", { businessId: business.id, googleCustomerId: campaign?.google_ads_customer_id ?? connection?.google_ads_customer_id ?? null, googleCampaignId: campaign?.google_campaign_id ?? null, snapshotHash: savedReview.review.snapshotHash, snapshotTimestamp: savedReview.review.snapshotTimestamp, keywordCount: savedReview.review.keywordCount, model: savedReview.review.model, durationMs: 0, cacheStatus: "hit" });
 }
 const hasOfferOptions = Boolean((services?.length ?? 0) || (inventory?.length ?? 0));
 const hasCampaigns = campaignCards.length > 0;
 const publishedCampaigns = (campaigns ?? []).filter((campaign: any) => ["published", "paused"].includes(campaign.status));
 const searchTermReviewsByCampaignId = new Map<string, NonNullable<ReturnType<typeof searchTermReview>>>();
 for (const entry of auditLog ?? []) {
  if (entry.event_type !== "google_ads_search_term_review_generated" || !entry.campaign_id || searchTermReviewsByCampaignId.has(entry.campaign_id)) continue;
  const review = searchTermReview(entry.metadata);
  if (review) searchTermReviewsByCampaignId.set(entry.campaign_id, review);
 }
 const selectedCustomerId = connection?.google_ads_customer_id ?? null;
 const selectedCustomer = customerChoices.find((customer) => customer.id === selectedCustomerId) ?? null;
 const validatedManagerLabel = selectedCustomer?.loginCustomerId
  ? customerChoices.find((customer: GoogleAdsCustomer) => customer.id === selectedCustomer.loginCustomerId)?.label
   ?? connectionAccess?.rootCustomerChoices?.find((customer: GoogleAdsCustomer) => customer.id === selectedCustomer.loginCustomerId)?.label
   ?? selectedCustomer.loginCustomerId
  : null;
 const discoveryRetryAt = connection?.account_discovery_retry_after_at ?? null;
 const discoveryRateLimited = Number(connection?.account_discovery_last_http_status ?? 0) === 429 && connection?.account_discovery_last_google_status === "RESOURCE_EXHAUSTED";
 const selectedAccountVerified = connection?.status === "account_access_verified";
 const setupConnected = Boolean(connection?.status && connection.status !== "disconnected" && connection.status !== "reauthorization_required");
 const betaEventNames = new Set((betaEvents ?? []).map((event: any) => String(event.event_name)));
 const billingReady = betaEventNames.has("google_ads_billing_ready") || publishedCampaigns.length > 0;
 const latestFeedback = betaFeedback?.[0] ?? null;
 const businessInfoReady = Boolean(business.name && business.email && (business.city || business.state));
 const landingPageReady = Boolean(website?.custom_domain || website?.public_slug);
 const metricsTotals = publishedCampaigns.reduce((totals: { spendMicros: number; impressions: number; clicks: number; conversions: number }, campaign: any) => {
  const metric = campaign.google_campaign_id ? metricsByCampaignId.get(String(campaign.google_campaign_id)) : null;
  if (!metric) return totals;
  totals.spendMicros += metric.costMicros;
  totals.impressions += metric.impressions;
  totals.clicks += metric.clicks;
  totals.conversions += metric.conversions;
  return totals;
 }, { spendMicros: 0, impressions: 0, clicks: 0, conversions: 0 });
const ctr = metricsTotals.impressions ? (metricsTotals.clicks / metricsTotals.impressions) * 100 : 0;
const cplMicros = metricsTotals.conversions ? metricsTotals.spendMicros / metricsTotals.conversions : 0;
 const activeMarketingIssues = (marketingIssues ?? []) as Array<{ id: string; title: string; message: string; severity: "info" | "warning" | "critical"; recommended_action: string | null; metadata: Record<string, unknown>; updated_at: string }>;
 const criticalIssueCount = activeMarketingIssues.filter((issue) => issue.severity === "critical").length;
 const warningIssueCount = activeMarketingIssues.filter((issue) => issue.severity === "warning").length;
 const accountHealthLabel = criticalIssueCount ? "Needs immediate attention" : warningIssueCount ? "Needs attention" : connection?.status === "reauthorization_required" ? "Reconnect required" : setupConnected ? "Connected" : "Not connected";
 const issueCheckTime = formatTimestamp(connection?.last_issue_check_at ?? connection?.last_issue_check_failed_at ?? null, business.timezone);
 const latestAction = query.error
  ? { tone: "error", title: "Latest action needs attention", message: query.error }
  : query.success
   ? { tone: "success", title: "Latest action completed", message: query.success }
   : connectionError
    ? { tone: "error", title: "Google Ads refresh needs attention", message: connectionError }
    : discoveryRateLimited
     ? {
      tone: "warning",
      title: "Account refresh is temporarily limited",
      message: `${selectedAccountVerified ? "Google Ads is connected. Account list refresh is temporarily limited by Google, but the selected account is still accessible." : "Google Ads connected, but Google temporarily limited account lookup. Try Refresh accounts later."}${discoveryRetryAt ? ` Retry after ${new Date(discoveryRetryAt).toLocaleString()}.` : ""}`,
     }
     : null;
 const setupSteps = [
  {
   id: "connect",
   label: "Connect your Google account",
   description: "Use the Google login that has access to your business's Google Ads.",
   done: setupConnected,
  },
  {
   id: "account",
   label: "Choose your Google Ads account",
   description: "Pick the account for this business.",
   done: Boolean(selectedCustomerId),
  },
  {
   id: "billing",
   label: "Confirm billing with Google",
   description: "Google needs a payment method before ads can run.",
   done: billingReady,
  },
  {
   id: "build",
   label: "Build campaign",
   description: "Servonas will help create the keywords, ad text, locations, and budget.",
   done: hasCampaigns,
  },
  {
   id: "review",
   label: "Review before it goes live",
   description: "Check everything before publishing to Google.",
   done: publishedCampaigns.length > 0,
  },
  {
   id: "track",
   label: "Start & track results",
   description: "See how many people see your ads, click, and become leads or customers.",
   done: publishedCampaigns.length > 0,
  },
 ] as const;
 const setupProgressCount = setupSteps.filter((step) => step.done).length;
 const currentStepIndex = setupSteps.findIndex((step) => !step.done);
 const setupComplete = setupSteps.every((step) => step.done);
 const nextStepIndex = currentStepIndex === -1 ? setupSteps.length - 1 : currentStepIndex;
 const nextStep = setupSteps[nextStepIndex] ?? setupSteps[0];
 const compactActivity = (auditLog ?? []).slice(0, 4);
 const liveCampaign = campaignCards.find(({ effectiveCardStatus }) => effectiveCardStatus === "published");

 await recordGoogleAdsBetaEvent({
  businessId: business.id,
  eventName: "google_ads_beta_viewed",
  metadata: {
   business_slug: business.slug,
   industry: business.industry_profile,
   timestamp: new Date().toISOString(),
  },
 });

 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page google-ads-page">
  <GoogleAdsPageLoadingOverlay />
  <section className="google-ads-hero">
   <div className="google-ads-hero-copy">
   <header className="marketing-analytics-header">
   <div>
    <span className="sv-kicker">Marketing</span>
    <div className="google-ads-page-title-row">
     <h1>Google Ads Beta</h1>
     {liveCampaign && <span className="campaign-status sent">{liveCampaign.statusLabel}</span>}
    </div>
   <p>Get more customers with Google Ads. Servonas helps build a simple Google Search campaign, choose keywords, write your ads, and track results while Google bills ad spend directly to your own account.</p>
   {business.name && <small>{business.name}</small>}
   <div className="google-ads-account-health">
    <strong>Google Ads status</strong>
    <span>{setupConnected ? "Connected" : "Not connected"} · {hasCampaigns ? "Campaign active" : "No live campaign"} · {accountHealthLabel}</span>
    <small>Last checked {issueCheckTime.relative}{issueCheckTime.absolute ? ` · ${issueCheckTime.absolute}` : ""}</small>
   </div>
   <form action={checkGoogleAdsStatusAction.bind(null, businessSlug)} className="google-ads-status-refresh">
    <button className="sv-button sv-secondary">Check Google Ads status</button>
   </form>
   </div>
   </header>
   </div>

  <section className={`workspace-panel google-ads-guide ${setupComplete ? "is-complete" : ""}`}>
   <div className="google-ads-guide-intro">
    <div>
     <span className="sv-kicker">Get started with Google Ads</span>
     <h2>{setupComplete ? "Google Ads setup complete" : nextStep.label}</h2>
     <p>{setupComplete ? "Everything is ready." : "Servonas will guide you through setup step by step. You stay in control of your budget, and Google bills you directly."}</p>
    </div>
    {!setupComplete && <div className="google-ads-beta-pricing">
     <article>
      <span>Servonas Ads Beta</span>
      <strong>$0</strong>
      <small>Included during beta. No setup fee or monthly management fee.</small>
     </article>
     <article>
      <span>Google advertising budget</span>
      <strong>You choose the amount</strong>
      <small>Start small and adjust anytime. Google bills you directly.</small>
     </article>
    </div>}
   </div>
   {!setupConnected && <section className="google-ads-onboarding-choice" aria-label="Google Ads onboarding">
    <div>
     <strong>Do you already have a Google Ads account?</strong>
     <p>Start here and Servonas will walk you through the rest. You do not need to know Google Ads terminology to get going.</p>
    </div>
    <GoogleAdsOauthLauncher businessSlug={businessSlug} />
   </section>}
   <div className="google-ads-guide-progress">
    <strong>Setup progress: {setupProgressCount} of {setupSteps.length} complete</strong>
    <span>{setupComplete ? "Everything is ready." : `Next up: ${nextStep.label}.`}{setupComplete && <b className="google-ads-guide-complete-check" aria-label="Setup complete">✓</b>}</span>
   </div>
   {!setupComplete && <div className="google-ads-guide-steps">
    {setupSteps.map((step, index) => {
     const state = step.done ? "complete" : index === nextStepIndex ? "current" : "upcoming";
     return <article key={step.id} className={`google-ads-guide-step is-${state}`}>
      <span>{index + 1}</span>
      <strong>{step.label}</strong>
      <small>{step.description}</small>
     </article>;
    })}
   </div>}
   {setupComplete && <details className="google-ads-setup-details">
    <summary>View setup details</summary>
    <div className="google-ads-guide-details-body">
     <div className="google-ads-readiness-mini">{setupSteps.map((step) => <span key={step.id} className="is-complete">{step.label}</span>)}</div>
     <div className="google-ads-beta-pricing">
      <article><span>Servonas Ads Beta</span><strong>$0</strong><small>Included during beta. No setup fee or monthly management fee.</small></article>
      <article><span>Google advertising budget</span><strong>You choose the amount</strong><small>Start small and adjust anytime. Google bills you directly.</small></article>
     </div>
     <section className="google-ads-readiness-group">
      <header><strong>Servonas already has these covered</strong><span>These checks help make sure your campaign has the basics it needs.</span></header>
      <div className="google-ads-supporting-checks">
       <article className={businessInfoReady ? "is-complete" : ""}><strong>Business info</strong><span>{businessInfoReady ? "Ready for ad drafting" : "Add email, city, or state"}</span></article>
       <article className={landingPageReady ? "is-complete" : ""}><strong>Landing page</strong><span>{landingPageReady ? "Ready for traffic" : "Publish a site or booking page"}</span></article>
      </div>
     </section>
    </div>
   </details>}
   <div className="google-ads-guide-actions">
    {setupConnected && !billingReady && <>
     <a className="sv-button" href={billingUrl(selectedCustomerId)} target="_blank" rel="noopener noreferrer">Complete Billing with Google</a>
     <form action={markGoogleAdsBillingReadyAction.bind(null, businessSlug)}>
      <input type="hidden" name="customerId" value={selectedCustomerId ?? ""} />
      <button className="sv-button sv-secondary">I finished billing setup</button>
     </form>
    </>}
   </div>
   {!setupComplete && <section className="google-ads-readiness-group">
    <header>
     <strong>Servonas already has these covered</strong>
     <span>These checks help make sure your campaign has the basics it needs.</span>
    </header>
    <div className="google-ads-supporting-checks">
     <article className={businessInfoReady ? "is-complete" : ""}><strong>Business info</strong><span>{businessInfoReady ? "Ready for ad drafting" : "Add email, city, or state"}</span></article>
     <article className={landingPageReady ? "is-complete" : ""}><strong>Landing page</strong><span>{landingPageReady ? "Ready for traffic" : "Publish a site or booking page"}</span></article>
    </div>
   </section>}
   </section>
  </section>
  {latestAction && <section className={`workspace-notice ${latestAction.tone} google-ads-latest-action`}><strong>{latestAction.title}</strong><span>{latestAction.message}</span></section>}
  {googleAdsReadyLabel() !== "ready" && <div className="workspace-notice error">Google Ads is not fully configured. Add `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, and `GOOGLE_ADS_DEVELOPER_TOKEN` before connecting tenants.</div>}
  {activeMarketingIssues.length ? <section className="google-ads-account-issues" aria-label="Google Ads account issues">
   {activeMarketingIssues.slice(0, 3).map((issue) => <article key={issue.id} className={`workspace-notice ${issue.severity === "critical" ? "error" : issue.severity === "warning" ? "warning" : "info"}`}>
    <strong>{issue.title}</strong>
    <span>{issue.message}</span>
    <small>{issue.recommended_action ?? "Review Google Ads and Servonas for details."}</small>
    <div className="google-ads-account-issue-actions">
     <a className="sv-button sv-secondary" href={connection?.google_ads_customer_id ? billingUrl(connection.google_ads_customer_id) : "https://ads.google.com/home/"} target="_blank" rel="noopener noreferrer">Fix in Google Ads</a>
     <Link className="sv-button sv-secondary" href={`/app/${businessSlug}/notifications?category=marketing`}>View details</Link>
    </div>
   </article>)}
  </section> : null}

  {hasCampaigns && <section className="google-ads-primary-stack">
   <section className="google-ads-campaign-grid">
    {campaignCards.map(({ campaign, metric, effectiveGoogleStatus, effectivePrimaryStatus, primaryStatusReasons, statusSyncUnavailable, issuesAvailable, effectiveCardStatus, statusLabel, summary }) => {
     const syncedAt = formatTimestamp(campaign.last_sync_at, business.timezone);
     const health = buildGoogleAdsCampaignHealth({
      campaign,
      metric,
      status: campaign.google_campaign_id ? campaignStatusesByCampaignId.get(String(campaign.google_campaign_id)) ?? null : null,
      locationTargeting: campaign.google_campaign_id ? campaignLocationsByCampaignId.get(String(campaign.google_campaign_id)) ?? null : null,
      snapshot: campaign.google_campaign_id ? campaignHealthSnapshotsByCampaignId.get(String(campaign.google_campaign_id)) ?? null : null,
      servingRelevantChangeAt: servingRelevantChangeByCampaignId.get(campaign.id) ?? null,
     });
     const savedAdGroups = adGroupsByCampaignId.get(String(campaign.id)) ?? [];
     const legacyAdGroup = savedAdGroups.length ? [] : [{
      id: `legacy-${campaign.id}`,
      ad_group_name: campaign.ad_group_name,
      destination_url: campaign.destination_url,
      status: campaign.status,
      keywords: campaign.keywords,
      negative_keywords: campaign.negative_keywords,
      ads: [{ finalUrl: campaign.destination_url, headlines: campaign.headlines, descriptions: campaign.descriptions }],
     }];
     const draftAdGroups = [...savedAdGroups, ...legacyAdGroup];
     const liveAdGroups = campaign.google_campaign_id ? liveAdGroupDetailsByCampaignId.get(String(campaign.google_campaign_id)) ?? [] : [];
     const landingRecommendations = googleAdsRecommendedLandingPages({
      website: website ? {
       publicSlug: website.public_slug ?? null,
       customDomain: website.custom_domain ?? null,
       status: website.status ?? null,
       domainStatus: website.domain_status ?? null,
       heroHeading: website.hero_heading ?? null,
       heroSubheading: website.hero_subheading ?? null,
       aboutText: website.about_text ?? null,
      } : null,
      businessSlug: business.slug,
      businessName: business.name,
      serviceName: typeof campaign.campaign_name === "string" ? campaign.campaign_name : null,
     });
     const selectableLandingRecommendations = landingRecommendations.filter((entry): entry is typeof entry & { url: string } => typeof entry.url === "string");
     const healthLabel = health.state === "healthy" ? "Healthy" : health.state === "monitoring" ? "Monitoring" : health.state === "critical_issue" ? "Critical issue" : "Needs attention";
     const savedKeywordReview = keywordReviewsByCampaignId.get(campaign.id) ?? null;
     const healthGroups = [
      { label: "Serving", category: "serving" },
      { label: "Optimization", category: "optimization" },
      { label: "Conversion tracking", category: "conversion_tracking" },
     ].map((group) => ({ ...group, issues: health.issues.filter((issue) => issue.category === group.category) })).filter((group) => group.issues.length);
     return <article className="workspace-panel google-ads-campaign-card" key={campaign.id}>
     <header>
     <div>
       <span className="sv-kicker">Campaign</span>
       <h2>{campaign.campaign_name}</h2>
       <p>{campaignLocationSummary(campaignLocationsByCampaignId.get(String(campaign.google_campaign_id ?? ""))?.targetedLocations ?? [])}</p>
      </div>
      {campaign.id !== liveCampaign?.campaign.id && <span className={`campaign-status ${effectiveCardStatus === "published" ? "sent" : effectiveCardStatus === "paused" ? "skipped" : effectiveCardStatus === "issue" || effectiveCardStatus === "failed" || effectiveCardStatus === "removed" ? "failed" : "queued"}`}>{statusLabel}</span>}
     </header>
     <section className={`google-ads-status-callout is-${summary.tone}`} aria-label="Campaign status summary">
      <div>
       <span className="google-ads-status-eyebrow">{summary.badge}</span>
       <h3>{summary.headline}</h3>
       <p>{summary.supporting}</p>
      </div>
      <div className="google-ads-status-meta">
       <strong>Google serving status: {effectivePrimaryStatus ? friendlyPrimaryStatus(effectivePrimaryStatus) : "Sync unavailable"}</strong>
       <span>Google campaign status: {effectiveGoogleStatus ?? "Sync unavailable"}</span>
      </div>
      <section className={`google-ads-health-panel google-ads-status-health is-${health.state}`} aria-label="Campaign health">
       <div className="google-ads-section-heading">
        <div><h3>Campaign health</h3><p>{health.state === "healthy" ? "No major setup issues detected." : health.state === "monitoring" ? "Servonas is monitoring delivery while Google begins serving this campaign." : "Servonas checks for configuration problems beyond Google's serving status."}</p></div>
        <span className="google-ads-health-badge">{healthLabel}</span>
       </div>
       {healthError ? <div className="workspace-notice warning">Some campaign health checks could not be verified. Verified checks are still shown below.</div> : null}
       {health.mostImportantIssue && health.mostImportantIssue.severity !== "healthy" ? <div className="google-ads-health-focus">
        <strong>{health.mostImportantIssue.fixActionId === "increase_manual_cpc" ? "Your maximum bid is too low" : health.mostImportantIssue.title}</strong>
        {health.mostImportantIssue.currentValue ? <span>Current: {health.mostImportantIssue.currentValue}</span> : null}
        {health.mostImportantIssue.fixActionId === "increase_manual_cpc" ? <><p>Your campaign is currently allowed to bid a maximum of {health.mostImportantIssue.currentValue} when someone searches for services like yours. That is likely too low to compete for local searches and may prevent your ad from being shown.</p><GoogleAdsBidAdjustment action={applyRecommendedGoogleAdsSettingsAction.bind(null, businessSlug, campaign.id)} currentBidDollars={Number(health.mostImportantIssue.currentValue?.replace(/[^0-9.]/g, "") ?? 0)} recommendedBidDollars={health.recommendedManualCpcMicros / 1_000_000} dailyBudgetLabel={dailyBudgetLabel(campaign.daily_budget_micros)} /></> : <>{<p>{health.mostImportantIssue.description}</p>}{health.mostImportantIssue.recommendedAction ? <p>{health.mostImportantIssue.recommendedAction}</p> : null}</>}
        {health.state === "monitoring" ? <small>We’ll flag this if the campaign remains at 0 impressions after {health.gracePeriodHoursRemaining} more hour{health.gracePeriodHoursRemaining === 1 ? "" : "s"}.</small> : null}
       </div> : null}
       {health.issues.filter((issue) => issue.fixActionId !== "increase_manual_cpc").length > 1 && <details className="google-ads-health-details"><summary>View health details</summary><div className="google-ads-health-list">{healthGroups.map((group) => <section key={group.category}><h4>{group.label}</h4>{group.issues.filter((issue) => issue.fixActionId !== "increase_manual_cpc").slice(0, 6).map((issue) => <article key={issue.id} className={`is-${issue.severity}`}><strong>{issue.title}</strong><span>{issue.currentValue ?? issue.description}</span></article>)}</section>)}</div></details>}
       {health.issues.some((issue) => issue.fixActionId && issue.fixActionId !== "increase_manual_cpc") && <section className="google-ads-recommendations" aria-label="Servonas recommends"><h4>Servonas recommends</h4>{health.issues.filter((issue) => issue.fixActionId && issue.fixActionId !== "increase_manual_cpc").map((issue) => <article key={`recommendation-${issue.id}`}><strong>Recommended</strong><b>{issue.title}</b><span>{issue.description}</span>{issue.fixActionId === "setup_booking_conversion" ? <small>Booking conversion tracking is not set up yet. Guided setup is not available in this release.</small> : null}</article>)}</section>}
      </section>
     </section>
     <section className="google-ads-overview-grid" aria-label="Campaign overview">
      <article className="google-ads-overview-stat">
       <span>Daily budget</span>
       <strong>{dailyBudgetLabel(campaign.daily_budget_micros)}</strong>
      </article>
      <article className="google-ads-overview-stat">
       <span>Monthly estimate</span>
       <strong>{money(Number(campaign.monthly_budget_estimate_cents ?? 0))}</strong>
      </article>
      <article className="google-ads-overview-stat google-ads-overview-destination">
       <span>Destination</span>
       <strong><a href={campaign.destination_url} target="_blank" rel="noopener noreferrer" aria-label={`Open destination: ${campaign.destination_url}`}>{campaign.destination_url}</a></strong>
      </article>
     <article className="google-ads-overview-stat">
       <span>Targeting</span>
       <strong>{campaignLocationSummary(campaignLocationsByCampaignId.get(String(campaign.google_campaign_id ?? ""))?.targetedLocations ?? [])}</strong>
      </article>
     </section>
     <section className="google-ads-performance-block" aria-label="Campaign performance">
      <div className="google-ads-section-heading">
       <div>
        <h3>Performance</h3>
        <p>{summary.performanceHint ?? "Track how many people are seeing, clicking, and converting from this campaign."}</p>
       </div>
      </div>
     <dl className="google-ads-facts google-ads-performance-facts">
       <div><dt>Impressions <span className="google-ads-metric-help" tabIndex={0} role="img" aria-label="Impressions help" data-tooltip="The number of times Google showed your ad in search results.">?</span></dt><dd>{metric?.impressions ?? "—"}</dd></div>
       <div><dt>Clicks <span className="google-ads-metric-help" tabIndex={0} role="img" aria-label="Clicks help" data-tooltip="The number of times someone clicked your ad and visited your website or booking page.">?</span></dt><dd>{metric?.clicks ?? "—"}</dd></div>
       <div><dt>CTR <span className="google-ads-metric-help" tabIndex={0} role="img" aria-label="Click-through rate help" data-tooltip="Click-through rate: the percentage of ad impressions that turned into clicks. Higher can mean the ad is relevant to the search.">?</span></dt><dd>{metric ? `${(metric.ctr * 100).toFixed(1)}%` : "—"}</dd></div>
       <div><dt>Avg CPC <span className="google-ads-metric-help" tabIndex={0} role="img" aria-label="Average cost per click help" data-tooltip="Average cost per click: the typical amount charged when someone clicks your ad. It can be lower or higher than your maximum bid.">?</span></dt><dd>{metric ? microsToMoney(metric.averageCpcMicros) : "—"}</dd></div>
       <div><dt>Conversions <span className="google-ads-metric-help" tabIndex={0} role="img" aria-label="Conversions help" data-tooltip="The number of tracked outcomes Google considers valuable, such as a lead, booking, or phone call.">?</span></dt><dd>{metric?.conversions ?? "—"}</dd></div>
      <div><dt>CPL <span className="google-ads-metric-help" tabIndex={0} role="img" aria-label="Cost per lead help" data-tooltip="Cost per lead: your ad spend divided by tracked conversions. It is unavailable until Google records a conversion.">?</span></dt><dd>{metric?.conversions ? microsToMoney(metric.costPerConversionMicros) : "—"}</dd></div>
     </dl>
     </section>
     <section className="google-ads-ad-group-panel" aria-label="Ad groups">
      <div className="google-ads-section-heading">
       <div>
        <h3>Ad groups</h3>
        <p>Organize one campaign into multiple services, keyword sets, and landing pages.</p>
       </div>
      </div>
      <div className="google-ads-ad-group-list">
       {draftAdGroups.map((adGroup: any) => {
        const matchedLive = liveAdGroups.find((entry) => entry.adGroupId === String(adGroup.google_ad_group_id ?? ""));
        const adList = Array.isArray(adGroup.ads) ? adGroup.ads : [];
        return <details key={adGroup.id} className="google-ads-ad-group-card">
         <summary>
          <span className="google-ads-ad-group-summary">
           <strong>{adGroup.ad_group_name}</strong>
           <small>{adGroup.destination_url}</small>
          </span>
          <span className="google-ads-ad-group-stats">{matchedLive ? `${matchedLive.impressions} impressions · ${matchedLive.clicks} clicks · ${matchedLive.conversions} conversions` : `${items(adGroup.keywords).length} keywords · ${adList.length || 1} ads`}</span>
         </summary>
         <div className="google-ads-ad-group-body">
          <div className="google-ads-ad-group-columns">
           <article>
            <strong>Landing page</strong>
            <a href={adGroup.destination_url} target="_blank" rel="noopener noreferrer">{adGroup.destination_url}</a>
            <small>{landingRecommendations.some((entry) => entry.url === adGroup.destination_url && entry.kind === "dedicated_service_page") ? "Using a dedicated page." : "If a dedicated service page exists, use it here to keep search intent tight."}</small>
           </article>
           <article>
            <strong>Keywords</strong>
            <span>{items(adGroup.keywords).slice(0, 6).join(" · ") || "No draft keywords yet"}</span>
            <small>{items(adGroup.negative_keywords).length} negative keywords</small>
           </article>
           <article>
            <strong>Ads</strong>
            <span>{adList.length || 1} responsive search ad{(adList.length || 1) === 1 ? "" : "s"}</span>
            <small>{adList[0]?.headlines?.slice?.(0, 2)?.join(" · ") || "Primary ad copy saved in this ad group."}</small>
           </article>
          </div>
          {matchedLive ? <div className="google-ads-ad-group-live">
           <strong>Live Google Ads data</strong>
           <div className="google-ads-ad-group-metrics">
            <span>Status: {matchedLive.status ?? "Unknown"}</span>
            <span>CTR: {(matchedLive.ctr * 100).toFixed(1)}%</span>
            <span>Cost: {microsToMoney(matchedLive.costMicros)}</span>
            <span>Ads: {matchedLive.ads.length}</span>
           </div>
           <div className="google-ads-ad-group-chips">
            {matchedLive.keywords.slice(0, 8).map((keyword) => <span key={`${matchedLive.adGroupId}-${keyword.id}`}>{keyword.text} {keyword.matchType ? `· ${friendlyKeywordValue(keyword.matchType)}` : ""}</span>)}
           </div>
          </div> : null}
         </div>
        </details>;
       })}
      </div>
      <details className="google-ads-ad-group-create">
       <summary>Add ad group</summary>
       <form className="google-ads-form" action={createGoogleAdsAdGroupAction.bind(null, businessSlug, campaign.id)}>
        <label>Ad group name<input name="adGroupName" defaultValue={`${campaign.campaign_name} Service`} /></label>
        <label>Destination URL<input name="destinationUrl" defaultValue={selectableLandingRecommendations.find((entry) => entry.recommended)?.url ?? campaign.destination_url} /></label>
        <label className="wide">Recommended landing pages<select name="secondaryDestinationUrl" defaultValue={selectableLandingRecommendations[1]?.url ?? ""}>
         {selectableLandingRecommendations.map((entry) => <option key={entry.url} value={entry.url}>{entry.label}{entry.recommended ? " (Recommended)" : ""}</option>)}
        </select></label>
        <label className="wide">Keywords<textarea name="keywords" rows={4} placeholder="christmas lights installation&#10;holiday light hanging" /></label>
        <label className="wide">Negative keywords<textarea name="negativeKeywords" rows={3} placeholder="jobs&#10;diy&#10;wholesale" /></label>
        <label className="wide">Primary ad headlines<textarea name="headlines" rows={4} placeholder="Christmas Light Installation&#10;Professional Holiday Lighting" /></label>
        <label className="wide">Primary ad descriptions<textarea name="descriptions" rows={3} placeholder="Book professional installation with a local team." /></label>
        <label className="wide">Optional second ad headlines<textarea name="secondaryHeadlines" rows={4} placeholder="Holiday Light Setup Near You" /></label>
        <label className="wide">Optional second ad descriptions<textarea name="secondaryDescriptions" rows={3} placeholder="Dedicated page and tighter service-specific copy." /></label>
        <div className="google-ads-form-actions"><button className="sv-button sv-secondary">Save ad group</button></div>
       </form>
      </details>
     </section>
     {campaign.google_campaign_id && <section className="google-ads-recommendations google-ads-keyword-review" aria-label="AI keyword review">
      <div className="google-ads-section-heading"><div><h3>Servonas keyword review</h3><p>Servonas reviews a fresh Google Ads keyword snapshot only when you request it.</p></div><form className="google-ads-card-actions" action={reviewGoogleAdsKeywordsAction.bind(null, businessSlug, campaign.id)}><button className="button secondary" type="submit">Review keywords</button>{savedKeywordReview && <button className="button secondary" name="force" value="true" type="submit">Review again</button>}</form></div>
      {savedKeywordReview ? <>
        <p className="google-ads-ai-review">Servonas AI review. Reviewed {new Date(savedKeywordReview.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}{savedKeywordReview.review.snapshotTimestamp ? `, based on Google Ads data from ${new Date(savedKeywordReview.review.snapshotTimestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}. {savedKeywordReview.stale ? "Google Ads data changed after this review. Review again for an updated analysis." : savedKeywordReview.review.performanceDataState === "early" ? "There is not enough performance data yet to judge which keywords truly convert, so this review focuses on configuration and intent." : "Recommendations use the recent campaign performance window."}</p>
        <div className="google-ads-health-focus">
         <strong>Servonas reviewed {savedKeywordReview.review.keywordsReviewed} active keyword{savedKeywordReview.review.keywordsReviewed === 1 ? "" : "s"}.</strong>
         <p>{customerFacingText(savedKeywordReview.review.summary, Array.from(savedKeywordReview.review.keywordDisplays.values()))}</p>
        </div>
        {[...savedKeywordReview.review.recommendations].sort((left,right)=>({high:0,medium:1,low:2}[left.priority]??3)-({high:0,medium:1,low:2}[right.priority]??3)).map((recommendation) => { const relevantKeywords = recommendation.keywordIds.map((id) => savedKeywordReview.review.keywordDisplays.get(id) ?? { ...unresolvedKeyword, id }); const displayedKeywords = relevantKeywords.slice(0, 3); const exactMatchCandidates = recommendation.category === "match_type" ? relevantKeywords.filter((keyword) => !keyword.negative && keyword.adGroupId && keyword.matchType !== "EXACT" && !Array.from(savedKeywordReview.review.keywordDisplays.values()).some((current) => !current.negative && current.matchType === "EXACT" && current.text.trim().replace(/\s+/g, " ").toLowerCase() === keyword.text.trim().replace(/\s+/g, " ").toLowerCase())) : []; const customerEvidence = readableRecommendationEvidence(recommendation.category, relevantKeywords); const bidRecommendation = recommendation.category === "bid" ? savedKeywordReview.review.bidRecommendations.find((entry) => recommendation.keywordIds.includes(entry.keywordId)) ?? null : null; const bidCandidates = recommendation.category === "bid" ? (savedKeywordReview.review.bidActionContext?.keywordCandidates ?? []).filter((entry) => recommendation.keywordIds.includes(entry.keywordId)) : []; const manualCpc = savedKeywordReview.review.bidActionContext?.biddingStrategy === "MANUAL_CPC"; const defaultBidAction = recommendation.category === "bid" && !bidRecommendation && !bidCandidates.length && manualCpc && Boolean(savedKeywordReview.review.bidActionContext?.defaultBidMicros && savedKeywordReview.review.bidActionContext.suggestedDefaultBidMicros); const automatedBidding = recommendation.category === "bid" && !manualCpc; const title = recommendation.category === "bid" ? "Your ad may not be showing high enough" : customerFacingText(recommendation.title, relevantKeywords); const explanation = recommendation.category === "bid" ? "Google indicates that this keyword may need a higher maximum bid to compete for prominent search placement." : customerFacingText(recommendation.explanation, relevantKeywords); return <details key={recommendation.id} className={`google-ads-recommendation-card is-${recommendation.priority}`}>
          <summary><span className="google-ads-recommendation-summary-copy"><span className="google-ads-recommendation-priority">{recommendation.priority === "high" ? "High priority" : recommendation.priority === "medium" ? "Medium priority" : "Low priority"}</span><strong>{title}</strong><small>{explanation}</small></span><span className="google-ads-recommendation-chevron" aria-hidden="true">⌄</span></summary>
          <div className="google-ads-recommendation-body">
           <p className="google-ads-recommendation-why">{recommendation.category === "bid" ? "A higher bid can help your ad appear more often when customers search for this service. It does not change your daily budget." : customerFacingText(recommendation.evidence[0] ?? "This recommendation is based on verified Google Ads facts in this review.", relevantKeywords)}</p>
           <div className="google-ads-recommendation-facts">
            <div><strong>Google data</strong><span>{customerEvidence.join(" · ")}</span></div>
            {displayedKeywords.length ? <div><strong>Relevant keywords</strong><span>{displayedKeywords.map((keyword) => keyword.text).join(" · ")}{relevantKeywords.length > displayedKeywords.length ? ` · +${relevantKeywords.length - displayedKeywords.length} more` : ""}</span></div> : null}
            {recommendation.suggestedValue ? <div><strong>Servonas recommends</strong><span>{customerFacingText(recommendation.suggestedValue.label ?? "Review this recommendation", relevantKeywords)}{recommendation.suggestedValue.value ? `: ${customerFacingText(recommendation.suggestedValue.value, relevantKeywords)}` : ""}</span></div> : null}
           </div>
           <div className="google-ads-recommendation-action"><strong>Recommended action</strong><span>{recommendedKeywordReviewAction(recommendation.category, relevantKeywords)}</span>
            {recommendation.category === "bid" && bidRecommendation ? <>{savedKeywordReview.appliedKeywordIds.has(bidRecommendation.keywordId) ? <p className="google-ads-recommendation-applied">Applied: {microsToMoney(bidRecommendation.currentBidMicros)} → {microsToMoney(bidRecommendation.recommendedBidMicros)}</p> : <details className="google-ads-health-confirm"><summary>Apply recommendation</summary><p>Servonas will update <strong>{bidRecommendation.keyword}</strong> from {microsToMoney(bidRecommendation.currentBidMicros)} to {microsToMoney(bidRecommendation.recommendedBidMicros)}. Your estimated daily budget remains unchanged.</p><form action={applyGoogleAdsKeywordBidRecommendationAction.bind(null, businessSlug, campaign.id)}><input type="hidden" name="keywordIds" value={bidRecommendation.keywordId} /><input type="hidden" name="maximumBidDollars" value={(bidRecommendation.recommendedBidMicros / 1_000_000).toFixed(2)} /><input type="hidden" name="confirmKeywordBid" value="apply" /><button className="button secondary" type="submit">Apply recommendation</button></form></details>}</> : null}
            {defaultBidAction ? <details className="google-ads-health-confirm"><summary>Adjust maximum bid</summary><p>Current maximum bid: {microsToMoney(savedKeywordReview.review.bidActionContext!.defaultBidMicros!)}. Your daily budget remains {dailyBudgetLabel(savedKeywordReview.review.bidActionContext!.dailyBudgetMicros)}.</p><form action={applyRecommendedGoogleAdsSettingsAction.bind(null, businessSlug, campaign.id)}><label>Servonas suggested starting point<input name="maximumBidDollars" type="number" min="0.01" step="0.01" defaultValue={(savedKeywordReview.review.bidActionContext!.suggestedDefaultBidMicros! / 1_000_000).toFixed(2)} /></label><input type="hidden" name="confirmCpcFix" value="apply" /><button className="button secondary" type="submit">Confirm update</button></form></details> : null}
            {recommendation.category === "bid" && !bidRecommendation && bidCandidates.length && manualCpc ? <details className="google-ads-health-confirm"><summary>Review and update bids</summary><p>Google has not provided a reliable dollar estimate. The editable starting point below is based on the current bid, not a Google recommendation.</p><form action={applyGoogleAdsKeywordBidRecommendationAction.bind(null, businessSlug, campaign.id)}><fieldset><legend>Select keywords to update</legend>{bidCandidates.map((candidate) => <label key={candidate.keywordId}><input type="checkbox" name="keywordIds" value={candidate.keywordId} defaultChecked />{candidate.keyword} · Current maximum bid {microsToMoney(candidate.currentBidMicros)}</label>)}</fieldset><label>Starting point<input name="maximumBidDollars" type="number" min="0.01" step="0.01" defaultValue={(bidCandidates[0]!.suggestedBidMicros / 1_000_000).toFixed(2)} /></label><input type="hidden" name="confirmKeywordBid" value="apply" /><button className="button secondary" type="submit">Confirm update</button></form></details> : null}
            {automatedBidding ? <p className="google-ads-recommendation-note">Google is managing bids automatically for this campaign, so Servonas cannot safely apply a manual bid change.</p> : null}
            {recommendation.category === "bid" && !bidRecommendation && !bidCandidates.length && !defaultBidAction && !automatedBidding ? <p className="google-ads-recommendation-note">Servonas could not verify a current Manual CPC bid and target ad group, so it cannot safely apply this change.</p> : null}
            {recommendation.category === "match_type" && exactMatchCandidates.length ? <GoogleAdsExactMatchKeywordReview suggestions={exactMatchCandidates.map((keyword) => ({ id: keyword.id, text: keyword.text, matchType: keyword.matchType }))} action={applyGoogleAdsExactMatchRecommendationAction.bind(null, businessSlug, campaign.id)} /> : null}
            {recommendation.category === "match_type" && !exactMatchCandidates.length ? <p className="google-ads-recommendation-applied">Exact-match versions already exist for these keywords.</p> : null}
           </div>
          </div>
         </details>; })}
       </> : <p className="google-ads-ai-review">No saved review yet. This does not run automatically or change Google Ads.</p>}
     </section>}
     <section className="google-ads-manage-panel" aria-label="Manage campaign">
      <div className="google-ads-manage-toolbar">
       {campaign.status === "draft" || campaign.status === "failed" ? <div className="google-ads-manage-actions"><form action={publishGoogleAdsDraftAction.bind(null, businessSlug, campaign.id)}><GoogleAdsDraftSubmit label="Publish campaign" pendingLabel="Publishing campaign…" pendingDescription="Servonas is publishing this campaign to Google Ads. Please keep this page open." /></form></div> : <>
         <GoogleAdsManageCampaignControls
          budgetDollars={(Number(campaign.daily_budget_micros) / 1_000_000).toFixed(0)}
          budgetLabel={dailyBudgetLabel(campaign.daily_budget_micros)}
          statusAction={!statusSyncUnavailable && effectiveGoogleStatus !== "REMOVED" ? setGoogleAdsCampaignStatusAction.bind(null, businessSlug, campaign.id, effectiveGoogleStatus === "PAUSED" ? "ENABLED" : "PAUSED") : null}
          statusLabel={!statusSyncUnavailable && effectiveGoogleStatus !== "REMOVED" ? effectiveGoogleStatus === "PAUSED" ? "Resume campaign" : "Pause campaign" : null}
          updateBudgetAction={updateGoogleAdsBudgetAction.bind(null, businessSlug, campaign.id)}
         />
       </>}
      </div>
     </section>
     <section className="google-ads-location-panel" aria-label="Location targeting">
      <div className="google-ads-section-heading">
       <div>
        <h3>Location targeting</h3>
        <p>Google Ads is the source of truth for where this campaign can appear.</p>
       </div>
      </div>
      {locationsError ? <div className="workspace-notice warning">Location targeting is temporarily unavailable. {locationsError}</div> : null}
      <GoogleAdsLocationManager
       businessSlug={businessSlug}
       campaignId={campaign.id}
       initialTargeting={campaignLocationsByCampaignId.get(String(campaign.google_campaign_id ?? "")) ?? null}
       initialError={locationsError}
       initialOpen={String(query.manageLocations ?? "") === String(campaign.id)}
      />
     </section>
     <details className="google-ads-technical-details">
      <summary>Technical details</summary>
      <dl className="google-ads-facts google-ads-technical-facts">
       <div><dt>Google campaign ID</dt><dd>{campaign.google_campaign_id ?? "Draft only"}</dd></div>
       <div><dt>Google status</dt><dd>{campaign.google_campaign_id ? (effectiveGoogleStatus ?? "Sync unavailable") : "Draft only"}</dd></div>
       <div><dt>Serving status</dt><dd>{campaign.google_campaign_id ? (effectivePrimaryStatus ? friendlyPrimaryStatus(effectivePrimaryStatus) : "Sync unavailable") : "Draft only"}</dd></div>
       <div><dt>Issues</dt><dd>{campaign.google_campaign_id ? (statusSyncUnavailable ? "Status sync unavailable" : primaryStatusReasons.length ? primaryStatusReasons.map(friendlyIssue).join(", ") : !issuesAvailable ? "Unavailable from Google" : "None reported") : "Draft only"}</dd></div>
       <div><dt>Last synced</dt><dd>{syncedAt.absolute ? <><strong>{syncedAt.relative}</strong><small>{syncedAt.absolute}</small></> : "Not synced yet"}</dd></div>
      </dl>
     </details>
     {statusSyncUnavailable && <div className="workspace-notice warning">Google campaign status could not be refreshed right now. Use Refresh metrics and try again.</div>}
     {campaign.last_error && <div className="workspace-notice error">{campaign.last_error}</div>}
     <details className="google-ads-draft-editor">
      <summary>Review and edit campaign draft</summary>
      <form className="google-ads-form" action={updateGoogleAdsDraftAction.bind(null, businessSlug, campaign.id)}>
       <label>Campaign name<input name="campaignName" defaultValue={campaign.campaign_name} /></label>
       <label>Ad group name<input name="adGroupName" defaultValue={campaign.ad_group_name} /></label>
       <label>Destination URL<input name="destinationUrl" defaultValue={campaign.destination_url} /></label>
      <label>Daily budget
        <span className="google-ads-input-with-unit"><span>$</span><input name="dailyBudgetDollars" type="number" min="1" step="1" defaultValue={(Number(campaign.daily_budget_micros) / 1_000_000).toFixed(0)} /><small>/ day</small></span>
       </label>
       <label>Bidding strategy
        <select name="biddingStrategy" defaultValue={campaign.bidding_strategy ?? "MAXIMIZE_CLICKS"}>
         <option value="MAXIMIZE_CLICKS">Maximize Clicks</option>
         <option value="MANUAL_CPC">Manual CPC</option>
        </select>
        <small>Recommended for new campaigns: Maximize Clicks.</small>
       </label>
       <label>Manual max CPC
        <span className="google-ads-input-with-unit"><span>$</span><input name="manualCpcBidDollars" type="number" min="0.5" step="0.01" defaultValue={campaign.manual_cpc_bid_micros ? (Number(campaign.manual_cpc_bid_micros) / 1_000_000).toFixed(2) : "2.00"} /><small>only for Manual CPC</small></span>
       </label>
       <label className="wide">Keywords<textarea name="keywords" rows={5} defaultValue={items(campaign.keywords).join("\n")} /></label>
       <details className="google-ads-keyword-section wide">
        <summary>Keywords &amp; search traffic</summary>
        <div className="google-ads-keyword-section-body">
         <label className="wide">Negative keywords<textarea name="negativeKeywords" rows={4} defaultValue={items(campaign.negative_keywords).join("\n")} /></label>
         {campaign.status !== "draft" && campaign.google_ad_group_id && <p className="google-ads-keyword-note">Add a new negative keyword below when you want to block unwanted searches without editing the full draft.</p>}
        </div>
       </details>
       <label className="wide">Headlines<textarea name="headlines" rows={5} defaultValue={items(campaign.headlines).join("\n")} /></label>
       <label className="wide">Descriptions<textarea name="descriptions" rows={4} defaultValue={items(campaign.descriptions).join("\n")} /></label>
       <div className="google-ads-form-actions"><button className="sv-button sv-secondary">Save changes</button></div>
      </form>
      {campaign.status !== "draft" && campaign.google_ad_group_id && <form id={`negative-keyword-${campaign.id}`} className="google-ads-negative-inline" action={addGoogleAdsNegativeKeywordAction.bind(null, businessSlug, campaign.id)}>
       <label>Add negative keyword<input name="keyword" placeholder="free" /></label>
       <button className="sv-button sv-secondary">Add negative keyword</button>
      </form>}
     </details>
    </article>;
    })}
   </section>
   <section className="workspace-panel google-ads-performance">
    <header><div><h2>Performance</h2><p>Track spend, traffic, and conversions for the selected reporting window.</p></div></header>
    {metricsError && <div className="workspace-notice warning">Performance metrics are temporarily unavailable. {metricsError}</div>}
    {metricsTotals.impressions === 0 && metricsTotals.clicks === 0 && metricsTotals.conversions === 0 ? <div className="google-ads-performance-empty"><strong>No traffic yet.</strong><p>Google has not recorded impressions for this campaign in the selected period. Review Campaign Health above for possible serving issues.</p><details><summary>Change reporting dates</summary><form className="marketing-filter-bar" action={refreshGoogleAdsCampaignsAction.bind(null, businessSlug)}><div className="marketing-filter-group"><label>From<input type="date" name="from" defaultValue={from} /></label><label>To<input type="date" name="to" defaultValue={to} /></label><label>Connected account<input value={connection?.google_ads_customer_id ?? "Not connected"} readOnly /></label></div><div className="marketing-filter-actions"><button className="sv-button">Refresh metrics</button></div></form></details></div> : <details className="google-ads-performance-details"><summary>View detailed performance</summary><div className="google-ads-performance-details-body"><form className="marketing-filter-bar" action={refreshGoogleAdsCampaignsAction.bind(null, businessSlug)}><div className="marketing-filter-group"><label>From<input type="date" name="from" defaultValue={from} /></label><label>To<input type="date" name="to" defaultValue={to} /></label><label>Connected account<input value={connection?.google_ads_customer_id ?? "Not connected"} readOnly /></label></div><div className="marketing-filter-actions"><button className="sv-button">Refresh metrics</button></div></form><section className="marketing-kpi-grid" aria-label="Google Ads summary"><article className="workspace-panel"><span>Active spend</span><strong>{microsToMoney(metricsTotals.spendMicros)}</strong><small>Google bills the connected account directly</small></article><article className="workspace-panel"><span>Impressions</span><strong>{metricsTotals.impressions}</strong><small>Within the selected date range</small></article><article className="workspace-panel"><span>Clicks</span><strong>{metricsTotals.clicks}</strong><small>{ctr.toFixed(1)}% CTR</small></article><article className="workspace-panel"><span>Conversions</span><strong>{metricsTotals.conversions}</strong><small>Google Ads-reported conversions</small></article><article className="workspace-panel"><span>Estimated CPL</span><strong>{metricsTotals.conversions ? microsToMoney(cplMicros) : "—"}</strong><small>Cost per conversion</small></article></section></div></details>}
   </section>
  </section>}

  <section className="google-ads-budget-explainer">
   <article className="workspace-panel">
    <span className="sv-kicker">Servonas Ads Beta</span>
    <strong>$0</strong>
    <p>Included during beta. Servonas does not charge a setup fee, monthly management fee, usage fee, or ad-spend percentage in this release.</p>
   </article>
   <article className="workspace-panel">
    <span className="sv-kicker">Your Google Ads budget</span>
    <strong>{campaigns?.length ? money(Number(campaigns?.[0]?.monthly_budget_estimate_cents ?? 0)) : "$500.00"}/month</strong>
    <p>This is your advertising budget with Google. Google bills it directly to your Google Ads account, not to Servonas.</p>
   </article>
  </section>

  <section className={`workspace-panel google-ads-builder ${hasCampaigns ? "is-secondary" : ""}`}>
   <header><div><h2>{hasCampaigns ? "Additional campaign" : "Build your first campaign"}</h2><p>{hasCampaigns ? "Want to promote another service or offer?" : "Choose the offer, pick a location focus, set a budget, and let Servonas generate a draft you can review before publishing."}</p></div></header>
   {hasCampaigns ? <details className="google-ads-create-more">
    <summary>Create another campaign</summary>
    <form className="google-ads-form" action={createGoogleAdsDraftAction.bind(null, businessSlug)}>
     <label>What do you want to advertise?
      <select name="serviceTarget" defaultValue="">
       <option value="">{hasOfferOptions ? "Choose a service or rental" : `Use ${industryLabel(business.industry_profile)} business`}</option>
       {(services ?? []).map((service: any) => <option key={`service-${service.id}`} value={`service:${service.id}`}>{service.name}</option>)}
       {(inventory ?? []).map((item: any) => <option key={`inventory-${item.id}`} value={`inventory:${item.id}`}>{item.name}</option>)}
      </select>
      {!hasOfferOptions && <small>No active services or rentals are available yet, so Servonas will draft the campaign from this business’s industry and website details.</small>}
     </label>
     <label>Where do you want customers from?
      <select name="geoTargetType" defaultValue="service_area">
       <option value="service_area">Service area</option>
       <option value="cities">Cities</option>
       <option value="zip_codes">ZIP codes</option>
       <option value="radius">Radius around business</option>
      </select>
     </label>
     <label>Service area / cities / ZIPs
      <textarea name="geoValues" rows={4} defaultValue={(territories ?? []).map((row: any) => row.name).join("\n")} />
     </label>
     <label>Radius miles
      <input name="radiusMiles" type="number" min="1" step="1" defaultValue="15" />
     </label>
     <label>Daily budget
      <input name="dailyBudgetDollars" type="number" min="1" step="1" defaultValue="10" />
      <small>About {money(30000)}/month. This is your Google advertising budget, and Google charges the connected Ads account directly. Servonas Ads Beta stays free.</small>
     </label>
     <label>Bidding strategy
      <select name="biddingStrategy" defaultValue="MAXIMIZE_CLICKS">
       <option value="MAXIMIZE_CLICKS">Maximize Clicks</option>
       <option value="MANUAL_CPC">Manual CPC</option>
      </select>
      <small>Recommended for new campaigns: Maximize Clicks. Use Manual CPC only when you want direct bid control.</small>
     </label>
     <label>Manual max CPC
      <input name="manualCpcBidDollars" type="number" min="0.5" step="0.01" defaultValue="2.00" />
      <small>Safer starting point for Manual CPC campaigns.</small>
     </label>
     <label>Destination website
      <input readOnly value={website?.custom_domain || (website?.public_slug ? `${process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com"}/sites/${website.public_slug}` : `${process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com"}/book/${business.slug}`)} />
     </label>
     <div className="google-ads-form-actions"><GoogleAdsDraftSubmit /></div>
    </form>
   </details> : <form className="google-ads-form" action={createGoogleAdsDraftAction.bind(null, businessSlug)}>
    <label>What do you want to advertise?
     <select name="serviceTarget" defaultValue="">
      <option value="">{hasOfferOptions ? "Choose a service or rental" : `Use ${industryLabel(business.industry_profile)} business`}</option>
      {(services ?? []).map((service: any) => <option key={`service-${service.id}`} value={`service:${service.id}`}>{service.name}</option>)}
      {(inventory ?? []).map((item: any) => <option key={`inventory-${item.id}`} value={`inventory:${item.id}`}>{item.name}</option>)}
     </select>
     {!hasOfferOptions && <small>No active services or rentals are available yet, so Servonas will draft the campaign from this business’s industry and website details.</small>}
    </label>
    <label>Where do you want customers from?
     <select name="geoTargetType" defaultValue="service_area">
      <option value="service_area">Service area</option>
      <option value="cities">Cities</option>
      <option value="zip_codes">ZIP codes</option>
      <option value="radius">Radius around business</option>
     </select>
    </label>
    <label>Service area / cities / ZIPs
     <textarea name="geoValues" rows={4} defaultValue={(territories ?? []).map((row: any) => row.name).join("\n")} />
    </label>
    <label>Radius miles
     <input name="radiusMiles" type="number" min="1" step="1" defaultValue="15" />
    </label>
    <label>Daily budget
     <input name="dailyBudgetDollars" type="number" min="1" step="1" defaultValue="10" />
     <small>About {money(30000)}/month. This is your Google advertising budget, and Google charges the connected Ads account directly. Servonas Ads Beta stays free.</small>
    </label>
    <label>Bidding strategy
     <select name="biddingStrategy" defaultValue="MAXIMIZE_CLICKS">
      <option value="MAXIMIZE_CLICKS">Maximize Clicks</option>
      <option value="MANUAL_CPC">Manual CPC</option>
     </select>
     <small>Recommended for new campaigns: Maximize Clicks. Use Manual CPC only when you want direct bid control.</small>
    </label>
    <label>Manual max CPC
     <input name="manualCpcBidDollars" type="number" min="0.5" step="0.01" defaultValue="2.00" />
     <small>Safer starting point for Manual CPC campaigns.</small>
    </label>
    <label>Destination website
     <input readOnly value={website?.custom_domain || (website?.public_slug ? `${process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com"}/sites/${website.public_slug}` : `${process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com"}/book/${business.slug}`)} />
    </label>
    <div className="google-ads-form-actions"><GoogleAdsDraftSubmit /></div>
   </form>}
  </section>

  {!hasCampaigns && <section className="workspace-panel marketing-empty-state"><strong>No Google Ads campaigns yet</strong><p>Connect Google Ads, generate a draft, and publish your first simple search campaign from Servonas.</p></section>}

  <section className="marketing-secondary-grid">
   <article className="google-ads-search-workspaces">
    {searchTermsError && <div className="workspace-notice warning">Search terms are temporarily unavailable. {searchTermsError}</div>}
    {publishedCampaigns.map((campaign: any) => { const review = searchTermReviewsByCampaignId.get(campaign.id) ?? null; return <GoogleAdsSearchTermsWorkspace key={campaign.id} businessSlug={businessSlug} campaignId={campaign.id} campaignName={campaign.campaign_name} terms={topSearchTerms.filter((term) => term.campaignId === String(campaign.google_campaign_id))} adGroupTotals={adGroupTotalsByCampaignId.get(String(campaign.google_campaign_id)) ?? []} review={review ? { summary: review.summary, terms: review.terms, createdAt: review.createdAt ?? "", dateFrom: review.dateFrom ?? from, dateTo: review.dateTo ?? to } : null} alreadyExcluded={[...items(campaign.negative_keywords), ...(review?.negatives ?? [])]} dateFrom={from} dateTo={to} />; })}
    {!publishedCampaigns.length && <section className="workspace-panel google-ads-search-workspace"><h2>Search terms</h2><div className="google-ads-compact-empty"><strong>Search terms are not ready yet.</strong><p>Publish a campaign and wait for Google to record traffic.</p></div></section>}
   </article>
   <article className="workspace-panel">
    <h2>Recent Google Ads activity</h2>
    <div className="google-ads-audit-list">{compactActivity.map((entry: any) => <article key={`${entry.event_type}-${entry.created_at}`}><strong>{entry.event_type.replaceAll("_", " ")}</strong><span>{new Date(entry.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span></article>)}</div>
    {(auditLog?.length ?? 0) > compactActivity.length && <details className="google-ads-manage-details"><summary>Show full activity</summary><div className="google-ads-audit-list">{(auditLog ?? []).slice(compactActivity.length).map((entry: any) => <article key={`${entry.event_type}-${entry.created_at}`}><strong>{entry.event_type.replaceAll("_", " ")}</strong><span>{new Date(entry.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span></article>)}</div></details>}
   </article>
  </section>

  <section className="marketing-secondary-grid">
   <article className="workspace-panel">
    <h2>Beta feedback</h2>
    <p>Tell us what is clear, what is confusing, and what blocked launch. This helps shape the paid release later.</p>
    <form className="google-ads-form" action={submitGoogleAdsBetaFeedbackAction.bind(null, businessSlug)}>
     <label>How did setup feel?
      <select name="rating" defaultValue={latestFeedback?.rating ?? "successful"}>
       <option value="successful">Smooth and ready to use</option>
       <option value="neutral">Mostly clear</option>
       <option value="confused">Confusing or blocked</option>
      </select>
     </label>
     <label className="wide">Anything we should improve?
      <textarea name="feedback" rows={4} placeholder="Where did setup get confusing? What should Servonas handle better next?" defaultValue="" />
     </label>
     <div className="google-ads-form-actions"><button className="sv-button sv-secondary">Send beta feedback</button></div>
    </form>
   </article>
   <article className="workspace-panel">
    <h2>What happens during beta</h2>
    <div className="google-ads-audit-list">
     <article><strong>Servonas builds the campaign</strong><span>Keyword suggestions, ad copy, budget controls, and reporting stay in Servonas.</span></article>
     <article><strong>Google serves the ads</strong><span>Your Google Ads account remains the system of record for billing, delivery, and policy review.</span></article>
     <article><strong>Support stays simple</strong><span>Beta analytics help Servonas see where onboarding stalls and where customers need help.</span></article>
   </div>
  </article>
 </section>

  {!setupConnected ? null : <section className="workspace-panel google-ads-connection-compact">
   <div className="google-ads-connection-summary">
    <div>
     <span className="sv-kicker">Connection</span>
     <h2>Google Ads account connected</h2>
     <p>{connection?.status === "account_access_verified" ? "Servonas can manage the selected Google Ads account." : connection?.status === "account_selected" ? "Google Ads is connected and an account has been selected." : connection?.status === "oauth_connected" || connection?.status === "account_discovery_pending" || connection?.status === "account_discovery_rate_limited" ? "Google Ads is connected. Choose the right account to keep going." : "Reconnect Google Ads to continue."}</p>
    </div>
    <div className="google-ads-connection-pills">
     <span>{selectedCustomer?.label || connection?.google_ads_customer_id || "No account selected"}</span>
     <span>{validatedManagerLabel ? "Connected through manager access" : "Direct advertiser access"}</span>
     {role === "platform_admin" && <span>{connection?.google_authenticated_email || "Unknown Google login"}</span>}
    </div>
   </div>
   {customerChoices.length > 1 && <form className="google-ads-inline-form" action={selectGoogleAdsCustomer.bind(null, businessSlug)}>
    <label>Google Ads account
     <select name="customerId" defaultValue={connection?.google_ads_customer_id ?? ""}>
      <option value="">Choose account</option>
      {customerChoices.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}
     </select>
    </label>
    <button className="sv-button sv-secondary">Save account</button>
   </form>}
   {!customerChoices.length && <div className="workspace-notice warning">No Google Ads accounts were returned for this login. If you do not have one yet, create it in Google first, then reconnect it here.</div>}
   <details className="google-ads-manage-details" open={Boolean(permissionDiagnostic)}>
    <summary>Manage connection</summary>
    <div className="google-ads-manage-grid">
     <div className="google-ads-audit-list">
      {role === "platform_admin" && <article><strong>Connected Google account</strong><span>{connection?.google_authenticated_email || "Unknown — reconnect to verify"}</span></article>}
      {role === "platform_admin" && <article><strong>Google profile name</strong><span>{connection?.google_authenticated_name || "Unavailable"}</span></article>}
      <article><strong>Access mode</strong><span>{validatedManagerLabel ? "Connected through manager access" : "Direct advertiser access"}</span></article>
      <article><strong>Selected Google Ads account</strong><span>{connection?.google_ads_customer_id || "Not selected yet"}</span></article>
      {validatedManagerLabel && role === "platform_admin" && <article><strong>Validated manager account</strong><span>{validatedManagerLabel}</span></article>}
      {role === "platform_admin" && <article><strong>Resolved login customer</strong><span>{connectionAccess?.loginCustomerId || "Direct advertiser access"}</span></article>}
     </div>
     <div className="google-ads-manage-actions">
      <form action={refreshGoogleAdsAccountsAction.bind(null, businessSlug)}><button className="sv-button sv-secondary">Refresh Google Ads accounts</button></form>
      {!customerChoices.length && <a className="sv-button sv-secondary" href={accountCreateUrl} target="_blank" rel="noopener noreferrer">Create Google Ads Account</a>}
      <a className="sv-button sv-secondary" href={`/api/google-ads/connect/${businessSlug}`}>Reconnect with another Google account</a>
      <form action={runGoogleAdsPermissionDiagnosticAction.bind(null, businessSlug)}><button className="sv-button sv-secondary">Test Google Ads access</button></form>
      <form action={disconnectGoogleAds.bind(null, businessSlug)}><button className="sv-button sv-secondary">Disconnect</button></form>
     </div>
    </div>
    {permissionDiagnostic && <div className="workspace-panel">
     <h3>Google Ads access diagnostic</h3>
     <div className="google-ads-audit-list">
      <article><strong>Authenticated Google account</strong><span>{permissionDiagnostic.authenticatedGoogleAccount.email || "Unavailable"}</span></article>
      <article><strong>Google display name</strong><span>{permissionDiagnostic.authenticatedGoogleAccount.name || "Unavailable"}</span></article>
      <article><strong>Access mode</strong><span>{permissionDiagnostic.resolvedLoginCustomerId ? "Manager account" : "Direct advertiser access"}</span></article>
      <article><strong>Manager</strong><span>{permissionDiagnostic.managerCustomerId || "Unavailable"}</span></article>
      <article><strong>Target</strong><span>{permissionDiagnostic.targetCustomerId || "Unavailable"}</span></article>
      <article><strong>Resolved login customer</strong><span>{permissionDiagnostic.resolvedLoginCustomerId || "Direct advertiser access"}</span></article>
      <article><strong>Classification</strong><span>{permissionDiagnostic.classification}</span></article>
     </div>
     <div className="marketing-sources-table">
      <div><b>Check</b><b>Result</b><b>Status</b><b>Details</b></div>
      {permissionDiagnostic.checks.map((check) => <div key={check.key}>
       <span>{check.label}</span>
       <span>{check.passed ? "PASS" : "FAIL"}</span>
       <span>{check.googleStatus || check.httpStatus || "OK"}</span>
       <span>{[check.googleMessage, ...check.details].filter(Boolean).join(" | ")}</span>
      </div>)}
     </div>
     <p>Accessible root customers: {permissionDiagnostic.accessibleRootCustomers.length ? permissionDiagnostic.accessibleRootCustomers.map((customer: GoogleAdsCustomer) => customer.label).join(", ") : "None returned"}</p>
     <p>Discovered manager accounts: {permissionDiagnostic.discoveredManagerAccounts.length ? permissionDiagnostic.discoveredManagerAccounts.map((customer: GoogleAdsCustomer) => customer.label).join(", ") : "None returned"}</p>
     <p>Discovered advertiser/client accounts: {permissionDiagnostic.discoveredAdvertiserAccounts.length ? permissionDiagnostic.discoveredAdvertiserAccounts.map((customer: GoogleAdsCustomer) => customer.label).join(", ") : "None returned"}</p>
     <p>`customers:listAccessibleCustomers` returned: {permissionDiagnostic.accessibleCustomers.length ? permissionDiagnostic.accessibleCustomers.join(", ") : "None returned"}</p>
    </div>}
   </details>
  </section>}
 </section></main>;
}
