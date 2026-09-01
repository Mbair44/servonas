"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { canManageBusiness } from "@/lib/access";
import {
 appendGoogleAdsNegativeKeyword,
 addGoogleAdsCampaignLocation,
 buildGoogleAdsCampaignHealth,
 discoverGoogleAdsAccounts,
 estimateMonthlyBudgetCents,
 fetchGoogleAdsCampaignLocationTargeting,
 fetchGoogleAdsAdGroupBid,
 fetchGoogleAdsManualCpcAdGroups,
 fetchGoogleAdsCampaignHealthSnapshots,
 fetchGoogleAdsCampaignStatuses,
 fetchGoogleAdsCampaignMetrics,
 generateGoogleAdsDraft,
 googleAdsErrorMessage,
 googleAdsPreferredLoginCustomerIds,
 loadTenantGoogleAdsAccess,
 removeGoogleAdsCampaignLocation,
 publishGoogleAdsCampaign,
 recordGoogleAdsBetaEvent,
 runGoogleAdsPermissionDiagnostic,
 searchGoogleAdsGeoTargets,
 submitGoogleAdsBetaFeedback,
 updateGoogleAdsCampaignBudget,
 updateGoogleAdsCampaignStatus,
 updateGoogleAdsAdGroupBid,
 updateTenantGoogleAdsSelection,
 disconnectTenantGoogleAds,
 writeGoogleAdsAuditLog,
} from "@/lib/googleAdsManagement";
import { googleAdsBidDollarsToMicros } from "@/lib/googleAdsBid";
import { requireWorkspace } from "@/lib/workspace";

const path = (slug: string, kind: "error" | "success", message: string) =>
 `/app/${encodeURIComponent(slug)}/marketing/google-ads?${kind}=${encodeURIComponent(message)}`;

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const numberValue = (data: FormData, key: string) => {
 const numeric = Number(text(data, key));
 return Number.isFinite(numeric) ? numeric : 0;
};
const lines = (data: FormData, key: string) => String(data.get(key) ?? "").split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
const billingUrl = (customerId: string) => `https://ads.google.com/aw/billing/summary?ocid=${encodeURIComponent(customerId)}`;
const manualCpcMicros = (data: FormData, key: string) => {
 const numeric = Number(text(data, key));
 return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 1_000_000) : null;
};
const selectedMaximumBidMicros = (data: FormData) => {
 return googleAdsBidDollarsToMicros(text(data, "maximumBidDollars"));
};
const resolvedMutationAccess = (
 status: string | null | undefined,
 choices: Array<{ id: string; loginCustomerId?: string | null }>,
 selectedCustomerId?: string | null,
) => {
 const selected = selectedCustomerId ? choices.find((customer) => customer.id === selectedCustomerId) ?? null : null;
 if (status === "account_access_verified") {
  return {
   targetCustomerId: selectedCustomerId ?? null,
   resolvedAccessMode: "direct" as const,
   resolvedLoginCustomerId: null,
   loginCustomerIds: googleAdsPreferredLoginCustomerIds([]),
   reason: "selected_customer_direct_access_previously_validated",
  };
 }
 if (selected?.loginCustomerId) {
  return {
   targetCustomerId: selectedCustomerId ?? null,
   resolvedAccessMode: "manager" as const,
   resolvedLoginCustomerId: selected.loginCustomerId,
   loginCustomerIds: googleAdsPreferredLoginCustomerIds([selected.loginCustomerId]),
   reason: "selected_customer_manager_login_customer_validated_during_account_discovery",
  };
 }
 return {
  targetCustomerId: selectedCustomerId ?? null,
  resolvedAccessMode: "direct" as const,
  resolvedLoginCustomerId: null,
  loginCustomerIds: googleAdsPreferredLoginCustomerIds([]),
  reason: selected ? "selected_customer_has_no_validated_manager_login_customer" : "selected_customer_not_found_in_discovered_choices",
 };
};
const limitedLines = (data: FormData, key: string, max: number) => lines(data, key).slice(0, max);
const logGoogleAdsAction = (message: string, payload: Record<string, unknown>) => {
 console.info(message, payload);
};
const logGoogleAdsActionError = (message: string, payload: Record<string, unknown>) => {
 console.error(message, payload);
};

async function syncPublishedGoogleAdsCampaignStatuses(input: {
 supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"];
 accessToken: string;
 businessId: string;
 businessSlug: string;
 userId: string;
 connectionStatus: string | null | undefined;
 connectionChoices: Array<{ id: string; loginCustomerId?: string | null }>;
 selectedCustomerId: string | null;
 campaigns: Array<{ id: string; google_campaign_id: string | null; google_ads_customer_id: string | null }>;
}) {
 const eligibleCampaigns = input.campaigns.filter((campaign) => campaign.google_campaign_id && campaign.google_ads_customer_id);
 if (!eligibleCampaigns.length) return new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignStatuses>>[number]>();
 const mutationAccess = resolvedMutationAccess(input.connectionStatus, input.connectionChoices, input.selectedCustomerId);
 logGoogleAdsAction("Google Ads action stage", {
  stage: "google_ads_campaign_status_sync",
  provider: "google_ads_api",
  businessId: input.businessId,
  businessSlug: input.businessSlug,
  campaignCount: eligibleCampaigns.length,
  targetCustomerId: mutationAccess.targetCustomerId,
  resolvedAccessMode: mutationAccess.resolvedAccessMode,
  resolvedLoginCustomerId: mutationAccess.resolvedLoginCustomerId,
  reason: mutationAccess.reason,
 });
  const snapshots = await fetchGoogleAdsCampaignStatuses({
  accessToken: input.accessToken,
  customerId: mutationAccess.targetCustomerId ?? input.selectedCustomerId ?? "",
  campaignIds: eligibleCampaigns.map((campaign) => String(campaign.google_campaign_id ?? "")),
  loginCustomerId: mutationAccess.resolvedLoginCustomerId,
  businessId: input.businessId,
 });
 const snapshotByCampaignId = new Map(snapshots.map((snapshot) => [snapshot.campaignId, snapshot]));
 for (const campaign of eligibleCampaigns) {
  const snapshot = snapshotByCampaignId.get(String(campaign.google_campaign_id ?? ""));
  if (!snapshot) continue;
  await input.supabase.from("business_google_ads_campaigns").update({
   google_campaign_resource_name: snapshot.campaignResourceName,
   google_campaign_status: snapshot.status,
   google_campaign_primary_status: snapshot.primaryStatus,
   google_campaign_primary_status_reasons: snapshot.primaryStatusReasons,
   status: snapshot.status === "REMOVED" ? "archived" : snapshot.status === "PAUSED" ? "paused" : "published",
   last_error: null,
   last_sync_at: new Date().toISOString(),
   updated_by: input.userId,
   updated_at: new Date().toISOString(),
  }).eq("business_id", input.businessId).eq("id", campaign.id);
 }
 logGoogleAdsAction("Google Ads action stage complete", {
  stage: "google_ads_campaign_status_sync",
  provider: "google_ads_api",
  businessId: input.businessId,
  businessSlug: input.businessSlug,
  campaignCount: snapshots.length,
 });
 return snapshotByCampaignId;
}

async function context(slug: string) {
 logGoogleAdsAction("Google Ads action stage", { stage: "load_business", provider: "supabase", businessSlug: slug });
 const loaded = await requireWorkspace(slug);
 logGoogleAdsAction("Google Ads action stage complete", { stage: "load_business", provider: "supabase", businessId: loaded.business.id, businessSlug: loaded.business.slug, role: loaded.role });
 if (!canManageBusiness(loaded.role)) redirect(path(slug, "error", "Only owners and administrators can manage Google Ads."));
 return loaded;
}

export async function selectGoogleAdsCustomer(slug: string, formData: FormData) {
 const { business, user } = await context(slug);
 const customerId = text(formData, "customerId");
 if (!customerId) redirect(path(slug, "error", "Choose a Google Ads account."));
 await updateTenantGoogleAdsSelection(business.id, customerId);
 await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, eventName: "google_ads_account_selected", metadata: { customer_id: customerId, business_slug: business.slug, timestamp: new Date().toISOString() } });
 await writeGoogleAdsAuditLog({ businessId: business.id, actorUserId: user.id, eventType: "google_ads_customer_selected", metadata: { customerId } });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Google Ads account selected."));
}

export async function refreshGoogleAdsAccountsAction(slug: string) {
 const { business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection) redirect(path(slug, "error", "Reconnect Google Ads before refreshing accounts."));
 const result = await discoverGoogleAdsAccounts({
  businessId: business.id,
  userId: user.id,
  authenticatedEmail: connection.authenticatedIdentity?.email ?? null,
  authenticatedName: connection.authenticatedIdentity?.name ?? null,
  force: true,
  maxAttempts: 2,
 });
 await recordGoogleAdsBetaEvent({
  businessId: business.id,
  actorUserId: user.id,
  eventName: "google_ads_accounts_refreshed",
  metadata: {
   business_slug: business.slug,
   customer_count: result.customers.length,
   rate_limited: !result.ok,
   retry_after_at: result.retryAfterAt,
   timestamp: new Date().toISOString(),
  },
 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, result.ok ? "success" : "error", result.ok ? "Google Ads accounts refreshed." : "Google Ads connected, but Google temporarily limited account lookup. Try refreshing accounts in a few minutes."));
}

export async function disconnectGoogleAds(slug: string) {
 const { business, user } = await context(slug);
 await disconnectTenantGoogleAds(business.id);
 await writeGoogleAdsAuditLog({ businessId: business.id, actorUserId: user.id, eventType: "google_ads_disconnected" });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Google Ads disconnected."));
}

export async function markGoogleAdsBillingReadyAction(slug: string, formData: FormData) {
 const { business, user } = await context(slug);
 const customerId = text(formData, "customerId");
 await recordGoogleAdsBetaEvent({
  businessId: business.id,
  actorUserId: user.id,
  eventName: "google_ads_billing_ready",
  metadata: {
   business_slug: business.slug,
   customer_id: customerId || null,
   timestamp: new Date().toISOString(),
  },
 });
 await writeGoogleAdsAuditLog({ businessId: business.id, actorUserId: user.id, eventType: "google_ads_billing_ready", metadata: { customerId: customerId || null } });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Google Ads billing marked ready."));
}

export async function submitGoogleAdsBetaFeedbackAction(slug: string, formData: FormData) {
 const { business, user } = await context(slug);
 const rating = text(formData, "rating");
 if (!["confused", "neutral", "successful"].includes(rating)) redirect(path(slug, "error", "Choose how setup felt before sending feedback."));
 const feedback = text(formData, "feedback");
 await submitGoogleAdsBetaFeedback({
  businessId: business.id,
  actorUserId: user.id,
  rating: rating as "confused" | "neutral" | "successful",
  feedback,
  metadata: {
   business_slug: business.slug,
   industry: business.industry_profile,
   timestamp: new Date().toISOString(),
  },
 });
 await recordGoogleAdsBetaEvent({
  businessId: business.id,
  actorUserId: user.id,
  eventName: "google_ads_beta_feedback_submitted",
  metadata: {
   business_slug: business.slug,
   rating,
   timestamp: new Date().toISOString(),
  },
 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Thanks. Your Google Ads beta feedback was sent."));
}

export async function createGoogleAdsDraftAction(slug: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Connect Google Ads and choose an account first."));
 const itemValue = text(formData, "serviceTarget");
 const [kind, id] = itemValue.split(":");
 const [{ data: service }, { data: inventory }, { data: website }, { data: territories }] = await Promise.all([
  kind === "service" && id ? supabase.from("services").select("id,name,description").eq("business_id", business.id).eq("id", id).eq("is_deleted", false).maybeSingle() : Promise.resolve({ data: null }),
  kind === "inventory" && id ? supabase.from("inventory_items").select("id,name,description").eq("business_id", business.id).eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
  supabase.from("business_website_settings").select("public_slug,custom_domain,status,domain_status,hero_heading,hero_subheading,about_text").eq("business_id", business.id).maybeSingle(),
  supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name"),
 ]);
 const hasOfferOptions = Boolean((service ?? inventory) || (kind !== "service" && kind !== "inventory"));
 if (!service && !inventory && !hasOfferOptions && !business.industry_profile) redirect(path(slug, "error", "Add a service, rental, or business industry before generating a draft."));
 const geoTargetType = text(formData, "geoTargetType") as "service_area" | "cities" | "zip_codes" | "radius";
 const dailyBudgetDollars = numberValue(formData, "dailyBudgetDollars");
 const biddingStrategy = text(formData, "biddingStrategy") === "MANUAL_CPC" ? "MANUAL_CPC" : "MAXIMIZE_CLICKS";
 const manualCpcBidMicros = biddingStrategy === "MANUAL_CPC" ? (manualCpcMicros(formData, "manualCpcBidDollars") ?? 2_000_000) : null;
  const draft = await generateGoogleAdsDraft({
  businessId: business.id,
  businessName: business.name,
  industry: business.industry_profile,
  userId: user.id,
  service: service ? { id: service.id, name: service.name, description: service.description ?? null } : null,
  rentalItem: inventory ? { id: inventory.id, name: inventory.name, description: inventory.description ?? null } : null,
  website: website ? {
   publicSlug: website.public_slug ?? null,
   customDomain: website.custom_domain ?? null,
   status: website.status ?? null,
   domainStatus: website.domain_status ?? null,
   heroHeading: website.hero_heading ?? null,
   heroSubheading: website.hero_subheading ?? null,
   aboutText: website.about_text ?? null,
  } : null,
  businessLocation: { city: business.city ?? null, state: business.state ?? null },
  serviceAreas: (territories ?? []).map((row: any) => String(row.name)).filter(Boolean),
  geoTargetType,
  geoValues: lines(formData, "geoValues"),
  radiusMiles: geoTargetType === "radius" ? numberValue(formData, "radiusMiles") || null : null,
  dailyBudgetDollars,
  biddingStrategy,
  manualCpcBidDollars: manualCpcBidMicros ? manualCpcBidMicros / 1_000_000 : null,
 });
 const micros = Math.max(1, Math.round(dailyBudgetDollars * 1_000_000));
 const { error } = await supabase.from("business_google_ads_campaigns").insert({
  business_id: business.id,
  service_id: service?.id ?? null,
  inventory_item_id: inventory?.id ?? null,
  google_ads_customer_id: connection.customerId,
  campaign_name: draft.campaignName,
  ad_group_name: draft.adGroupName,
  bidding_strategy: biddingStrategy,
  manual_cpc_bid_micros: manualCpcBidMicros,
  destination_url: draft.destinationUrl,
  status: "draft",
  daily_budget_micros: micros,
  monthly_budget_estimate_cents: estimateMonthlyBudgetCents(dailyBudgetDollars),
  geo_target_type: geoTargetType,
  geo_target_summary: draft.geoTargetSummary,
  geo_target_config: draft.geoTargetConfig,
  keywords: draft.keywords,
  negative_keywords: draft.negativeKeywords,
  headlines: draft.headlines,
  descriptions: draft.descriptions,
  created_by: user.id,
  updated_by: user.id,
 });
 if (error) redirect(path(slug, "error", "The Google Ads draft could not be saved. Apply the Google Ads migration first."));
 await recordGoogleAdsBetaEvent({
  businessId: business.id,
  actorUserId: user.id,
  eventName: "google_ads_campaign_generated",
  metadata: {
   business_slug: business.slug,
   service_id: service?.id ?? null,
   inventory_item_id: inventory?.id ?? null,
   geo_target_type: geoTargetType,
   budget_monthly_cents: estimateMonthlyBudgetCents(dailyBudgetDollars),
   source_flow: "beta_setup",
   timestamp: new Date().toISOString(),
  },
 });
 await writeGoogleAdsAuditLog({
  businessId: business.id,
  actorUserId: user.id,
  eventType: "google_ads_draft_created",
  metadata: { customerId: connection.customerId, serviceId: service?.id ?? null, inventoryItemId: inventory?.id ?? null, geoTargetType },
 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Google Ads draft generated. Review it before publishing."));
}

export async function updateGoogleAdsDraftAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const keywords = lines(formData, "keywords");
 const negatives = lines(formData, "negativeKeywords");
 const headlines = limitedLines(formData, "headlines", 15);
 const descriptions = limitedLines(formData, "descriptions", 4);
 const budgetDollars = numberValue(formData, "dailyBudgetDollars");
 const biddingStrategy = text(formData, "biddingStrategy") === "MANUAL_CPC" ? "MANUAL_CPC" : "MAXIMIZE_CLICKS";
 const manualBidMicros = biddingStrategy === "MANUAL_CPC" ? (manualCpcMicros(formData, "manualCpcBidDollars") ?? 2_000_000) : null;
 const { error } = await supabase.from("business_google_ads_campaigns").update({
  campaign_name: text(formData, "campaignName"),
  ad_group_name: text(formData, "adGroupName"),
  bidding_strategy: biddingStrategy,
  manual_cpc_bid_micros: manualBidMicros,
  destination_url: text(formData, "destinationUrl"),
  keywords,
  negative_keywords: negatives,
  headlines,
  descriptions,
  daily_budget_micros: Math.round(budgetDollars * 1_000_000),
  monthly_budget_estimate_cents: estimateMonthlyBudgetCents(budgetDollars),
  updated_by: user.id,
  updated_at: new Date().toISOString(),
 }).eq("business_id", business.id).eq("id", campaignId);
 if (error) redirect(path(slug, "error", "The Google Ads draft could not be updated."));
 await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, campaignId, eventName: "google_ads_campaign_edited", metadata: { business_slug: business.slug, timestamp: new Date().toISOString() } });
 await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_draft_updated" });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Google Ads draft updated."));
}

export async function publishGoogleAdsDraftAction(slug: string, campaignId: string) {
 const { supabase, business, user } = await context(slug);
 logGoogleAdsAction("Google Ads action stage", { stage: "load_google_ads_connection", provider: "supabase", businessId: business.id, businessSlug: business.slug, campaignId });
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Reconnect Google Ads before publishing."));
 logGoogleAdsAction("Google Ads action stage complete", { stage: "load_google_ads_connection", provider: "supabase", businessId: business.id, businessSlug: business.slug, campaignId, selectedCustomerId: connection.customerId, customerChoiceCount: connection.customerChoices.length });
 logGoogleAdsAction("Google Ads action stage", { stage: "load_campaign", provider: "supabase", businessId: business.id, businessSlug: business.slug, campaignId });
 const { data: campaign } = await supabase.from("business_google_ads_campaigns").select("*").eq("business_id", business.id).eq("id", campaignId).maybeSingle();
 if (!campaign) redirect(path(slug, "error", "Google Ads draft not found."));
 logGoogleAdsAction("Google Ads action stage complete", { stage: "load_campaign", provider: "supabase", businessId: business.id, businessSlug: business.slug, campaignId, googleAdsCustomerId: connection.customerId, draftStatus: campaign.status });
 try {
  await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, campaignId, eventName: "google_ads_campaign_reviewed", metadata: { business_slug: business.slug, timestamp: new Date().toISOString() } });
  const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, connection.customerId);
  logGoogleAdsAction("Google Ads action stage", {
   stage: "google_ads_campaign_publish",
   provider: "google_ads_api",
   businessId: business.id,
   businessSlug: business.slug,
   campaignId,
   targetCustomerId: mutationAccess.targetCustomerId,
   resolvedAccessMode: mutationAccess.resolvedAccessMode,
   resolvedLoginCustomerId: mutationAccess.resolvedLoginCustomerId,
   loginCustomerIds: mutationAccess.loginCustomerIds,
   reason: mutationAccess.reason,
  });
  const published = await publishGoogleAdsCampaign({
   accessToken: connection.accessToken,
   customerId: connection.customerId,
   loginCustomerIds: mutationAccess.loginCustomerIds,
   campaignName: campaign.campaign_name,
   adGroupName: campaign.ad_group_name,
   dailyBudgetMicros: Number(campaign.daily_budget_micros),
   biddingStrategy: campaign.bidding_strategy === "MANUAL_CPC" ? "MANUAL_CPC" : "MAXIMIZE_CLICKS",
   manualCpcBidMicros: Number(campaign.manual_cpc_bid_micros ?? 0) || null,
   destinationUrl: campaign.destination_url,
   keywords: Array.isArray(campaign.keywords) ? campaign.keywords.map(String) : [],
   negativeKeywords: Array.isArray(campaign.negative_keywords) ? campaign.negative_keywords.map(String) : [],
   headlines: Array.isArray(campaign.headlines) ? campaign.headlines.map(String) : [],
   descriptions: Array.isArray(campaign.descriptions) ? campaign.descriptions.map(String) : [],
  });
  logGoogleAdsAction("Google Ads action stage complete", { stage: "google_ads_campaign_publish", provider: "google_ads_api", businessId: business.id, businessSlug: business.slug, campaignId, googleCampaignId: published.campaignId, adGroupId: published.adGroupId });
  const { error } = await supabase.from("business_google_ads_campaigns").update({
   google_campaign_id: published.campaignId,
   google_campaign_resource_name: published.campaignResourceName,
   google_campaign_budget_resource_name: published.campaignBudgetResourceName,
   google_ad_group_id: published.adGroupId,
   status: "published",
   last_error: null,
   last_published_at: new Date().toISOString(),
   last_sync_at: new Date().toISOString(),
   updated_by: user.id,
   updated_at: new Date().toISOString(),
  }).eq("business_id", business.id).eq("id", campaignId);
 if (error) redirect(path(slug, "error", "The campaign was published to Google, but Servonas could not save the resulting IDs."));
  await syncPublishedGoogleAdsCampaignStatuses({
   supabase,
   accessToken: connection.accessToken,
   businessId: business.id,
   businessSlug: business.slug,
   userId: user.id,
   connectionStatus: connection.status,
   connectionChoices: connection.customerChoices,
   selectedCustomerId: connection.customerId,
   campaigns: [{ id: campaignId, google_campaign_id: published.campaignId, google_ads_customer_id: connection.customerId }],
  });
  await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, campaignId, eventName: "google_ads_campaign_published", metadata: { business_slug: business.slug, google_campaign_id: published.campaignId, timestamp: new Date().toISOString() } });
 await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_campaign_published", metadata: published });
  revalidatePath(`/app/${slug}/marketing/google-ads`);
  logGoogleAdsAction("Google Ads action redirect", { stage: "complete", provider: "next_redirect", businessId: business.id, businessSlug: business.slug, campaignId, outcome: "success", location: path(slug, "success", "Campaign published to Google Ads.") });
  redirect(path(slug, "success", "Campaign published to Google Ads."));
 } catch (error) {
  if (isRedirectError(error)) throw error;
  const message = error instanceof Error ? googleAdsErrorMessage(error) : "Google Ads publishing failed.";
  logGoogleAdsActionError("Google Ads publish failed", {
   businessId: business.id,
   businessSlug: business.slug,
   campaignId,
   stage: "google_ads_campaign_publish",
   provider: "google_ads_api",
   caught: true,
   willRedirect303: true,
   googleAdsCustomerId: connection.customerId,
   message,
   errorName: error instanceof Error ? error.name : "unknown",
   errorStatus: error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : null,
   googleStatus: error && typeof error === "object" && "googleStatus" in error ? (error as { googleStatus?: unknown }).googleStatus : null,
   loginCustomerId: error && typeof error === "object" && "loginCustomerId" in error ? (error as { loginCustomerId?: unknown }).loginCustomerId : null,
   targetCustomerId: error && typeof error === "object" && "targetCustomerId" in error ? (error as { targetCustomerId?: unknown }).targetCustomerId : null,
   googleDetails: error && typeof error === "object" && "details" in error ? (error as { details?: unknown }).details : null,
  });
  await supabase.from("business_google_ads_campaigns").update({
   status: "failed",
   last_error: message,
   updated_by: user.id,
   updated_at: new Date().toISOString(),
  }).eq("business_id", business.id).eq("id", campaignId);
  const lower = message.toLowerCase();
  if (lower.includes("billing") || lower.includes("payment")) {
   await recordGoogleAdsBetaEvent({
    businessId: business.id,
    actorUserId: user.id,
    campaignId,
    eventName: "google_ads_billing_required",
    metadata: {
     business_slug: business.slug,
     customer_id: connection.customerId,
     billing_url: connection.customerId ? billingUrl(connection.customerId) : null,
     timestamp: new Date().toISOString(),
    },
   });
  }
  await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, campaignId, eventName: "google_ads_campaign_publish_failed", metadata: { business_slug: business.slug, reason: message, timestamp: new Date().toISOString() } });
  logGoogleAdsAction("Google Ads action redirect", { stage: "complete", provider: "next_redirect", businessId: business.id, businessSlug: business.slug, campaignId, outcome: "error", location: path(slug, "error", message), reason: message });
  redirect(path(slug, "error", message));
 }
}

export async function setGoogleAdsCampaignStatusAction(slug: string, campaignId: string, nextStatus: "ENABLED" | "PAUSED") {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 const { data: campaign } = await supabase.from("business_google_ads_campaigns").select("google_campaign_id,google_ads_customer_id").eq("business_id", business.id).eq("id", campaignId).maybeSingle();
 if (!connection?.customerId || !campaign?.google_campaign_id) redirect(path(slug, "error", "The published campaign could not be found."));
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 await updateGoogleAdsCampaignStatus({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  loginCustomerIds: mutationAccess.loginCustomerIds,
  campaignId: campaign.google_campaign_id,
  status: nextStatus,
 });
 await supabase.from("business_google_ads_campaigns").update({
  status: nextStatus === "PAUSED" ? "paused" : "published",
  last_sync_at: new Date().toISOString(),
  updated_by: user.id,
  updated_at: new Date().toISOString(),
 }).eq("business_id", business.id).eq("id", campaignId);
 await syncPublishedGoogleAdsCampaignStatuses({
  supabase,
  accessToken: connection.accessToken,
  businessId: business.id,
  businessSlug: business.slug,
  userId: user.id,
  connectionStatus: connection.status,
  connectionChoices: connection.customerChoices,
  selectedCustomerId: campaign.google_ads_customer_id ?? connection.customerId,
  campaigns: [{ id: campaignId, google_campaign_id: campaign.google_campaign_id, google_ads_customer_id: campaign.google_ads_customer_id }],
 });
 await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: nextStatus === "PAUSED" ? "google_ads_campaign_paused" : "google_ads_campaign_resumed" });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", nextStatus === "PAUSED" ? "Campaign paused." : "Campaign resumed."));
}

export async function updateGoogleAdsBudgetAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 const { data: campaign } = await supabase.from("business_google_ads_campaigns").select("google_ads_customer_id,google_campaign_budget_resource_name").eq("business_id", business.id).eq("id", campaignId).maybeSingle();
 const dailyBudgetDollars = numberValue(formData, "dailyBudgetDollars");
 if (!campaign?.google_campaign_budget_resource_name || !connection?.accessToken) redirect(path(slug, "error", "The published campaign budget could not be updated."));
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 await updateGoogleAdsCampaignBudget({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  loginCustomerIds: mutationAccess.loginCustomerIds,
  budgetResourceName: campaign.google_campaign_budget_resource_name,
  dailyBudgetMicros: Math.round(dailyBudgetDollars * 1_000_000),
 });
 await supabase.from("business_google_ads_campaigns").update({
  daily_budget_micros: Math.round(dailyBudgetDollars * 1_000_000),
  monthly_budget_estimate_cents: estimateMonthlyBudgetCents(dailyBudgetDollars),
  last_sync_at: new Date().toISOString(),
  updated_by: user.id,
  updated_at: new Date().toISOString(),
 }).eq("business_id", business.id).eq("id", campaignId);
 await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_budget_updated", metadata: { dailyBudgetDollars } });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Campaign budget updated."));
}

export async function applyRecommendedGoogleAdsSettingsAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Reconnect Google Ads before updating campaign settings."));
 const { data: campaign } = await supabase.from("business_google_ads_campaigns").select("google_ads_customer_id,google_campaign_id,google_ad_group_id,bidding_strategy,daily_budget_micros,manual_cpc_bid_micros,destination_url,status,created_at").eq("business_id", business.id).eq("id", campaignId).maybeSingle();
 if (!campaign?.google_campaign_id || !campaign.google_ads_customer_id) redirect(path(slug, "error", "The selected campaign could not be verified."));
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 if (String(formData.get("confirmCpcFix") ?? "") !== "apply") redirect(path(slug, "error", "Confirm the max CPC change before applying it."));
 const requestedCpcMicros = selectedMaximumBidMicros(formData);
 if (!requestedCpcMicros) redirect(path(slug, "error", "Enter a positive maximum bid using dollars and up to two decimal places."));
 const startedAt = Date.now();
 logGoogleAdsAction("Google Ads CPC fix started", { stage: "fix_cpc_started", businessId: business.id, campaignId: campaign.google_campaign_id, requestedCpcMicros });
 const selectedCustomerVerified = connection.customerId === campaign.google_ads_customer_id || connection.customerChoices.some((choice: { id: string }) => choice.id === campaign.google_ads_customer_id);
 if (!selectedCustomerVerified) {
  logGoogleAdsActionError("Google Ads CPC readiness failed", { stage: "recommended_setting_update_readiness_failed", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, authorized: true, campaignVerified: true, adGroupVerified: false, biddingStrategyVerified: false, currentCpcVerified: false, requestedCpcValid: true, blockingReasons: ["selected_customer_not_verified"] });
  redirect(path(slug, "error", "The selected Google Ads customer could not be verified for this campaign."));
 }
 const liveAdGroups = await fetchGoogleAdsManualCpcAdGroups({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, loginCustomerId: mutationAccess.resolvedLoginCustomerId, businessId: business.id });
 if (!liveAdGroups.length || liveAdGroups.some((adGroup) => adGroup.biddingStrategyType !== "MANUAL_CPC")) {
  const blockingReasons = !liveAdGroups.length ? ["target_ad_group_not_found"] : ["campaign_not_manual_cpc"];
  logGoogleAdsActionError("Google Ads CPC readiness failed", { stage: "recommended_setting_update_readiness_failed", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, authorized: true, campaignVerified: true, adGroupVerified: liveAdGroups.length > 0, biddingStrategyVerified: false, currentCpcVerified: false, requestedCpcValid: true, blockingReasons });
  redirect(path(slug, "error", !liveAdGroups.length ? "Servonas could not verify the target ad group." : "This campaign is not using Manual CPC."));
 }
 const oldCpcMicros = Math.min(...liveAdGroups.map((adGroup) => adGroup.cpcBidMicros).filter((bid) => bid > 0));
 const matchingAdGroups = liveAdGroups.filter((adGroup) => adGroup.cpcBidMicros === oldCpcMicros);
 if (!Number.isFinite(oldCpcMicros) || matchingAdGroups.length !== 1) {
  logGoogleAdsActionError("Google Ads CPC readiness failed", { stage: "recommended_setting_update_readiness_failed", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, authorized: true, campaignVerified: true, adGroupVerified: true, biddingStrategyVerified: true, currentCpcVerified: false, requestedCpcValid: true, blockingReasons: ["current_cpc_not_uniquely_verified"] });
  redirect(path(slug, "error", "Servonas could not read one verified current maximum bid for the target ad group."));
 }
 const targetAdGroup = matchingAdGroups[0]!;
 logGoogleAdsAction("Google Ads CPC fix ad group resolved", { stage: "fix_cpc_ad_group_resolved", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, durationMs: Date.now() - startedAt });
 logGoogleAdsAction("Google Ads CPC fix mutation started", { stage: "fix_cpc_mutation_started", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, resourceType: "ad_group", resourceName: `customers/${campaign.google_ads_customer_id}/adGroups/${targetAdGroup.id}`, updateFields: ["cpc_bid_micros"], customerId: campaign.google_ads_customer_id });
 const mutation = await updateGoogleAdsAdGroupBid({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  loginCustomerIds: mutationAccess.loginCustomerIds,
  adGroupId: targetAdGroup.id,
  cpcBidMicros: requestedCpcMicros,
 });
 logGoogleAdsAction("Google Ads CPC fix mutation completed", { stage: "fix_cpc_mutation_completed", provider: "google_ads_api", endpointHost: "googleads.googleapis.com", endpointPath: `/customers/${campaign.google_ads_customer_id}/adGroups:mutate`, method: "POST", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, updateMask: "cpc_bid_micros", returnedResourceName: mutation.resourceName, mutationResultCount: mutation.mutationResultCount, partialFailure: mutation.partialFailure, httpStatus: mutation.httpStatus, googleRequestId: mutation.googleRequestId, durationMs: Date.now() - startedAt });
 logGoogleAdsAction("Google Ads CPC fix verification started", { stage: "fix_cpc_verify_started", provider: "google_ads_api", endpointHost: "googleads.googleapis.com", endpointPath: `/customers/${campaign.google_ads_customer_id}/googleAds:searchStream`, method: "POST", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, requestedCpcMicros, requestType: "focused_ad_group_bid_verification" });
 let verification: Awaited<ReturnType<typeof fetchGoogleAdsAdGroupBid>>;
 try {
  verification = await fetchGoogleAdsAdGroupBid({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, adGroupId: targetAdGroup.id, loginCustomerId: mutationAccess.resolvedLoginCustomerId, businessId: business.id });
 } catch (error) {
  logGoogleAdsActionError("Google Ads CPC verification failed", { stage: "fix_cpc_verify_completed", provider: "google_ads_api", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, requestedCpcMicros, errorMessage: error instanceof Error ? error.message : "Unknown verification failure", durationMs: Date.now() - startedAt });
  redirect(path(slug, "error", "Google Ads accepted the update, but Servonas could not verify the new bid."));
 }
 logGoogleAdsAction("Google Ads CPC fix verification completed", { stage: "fix_cpc_verify_completed", provider: "google_ads_api", endpointHost: "googleads.googleapis.com", endpointPath: `/customers/${campaign.google_ads_customer_id}/googleAds:searchStream`, method: "POST", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, returnedResourceName: mutation.resourceName, verifiedCpcMicros: verification?.cpcBidMicros ?? null, googleRequestId: mutation.googleRequestId, durationMs: Date.now() - startedAt });
 if (verification?.cpcBidMicros !== requestedCpcMicros) redirect(path(slug, "error", "Google Ads did not verify the requested maximum bid on the target ad group, so Servonas did not record the change."));
 await supabase.from("business_google_ads_campaigns").update({
  manual_cpc_bid_micros: requestedCpcMicros,
  last_sync_at: new Date().toISOString(),
  updated_by: user.id,
  updated_at: new Date().toISOString(),
 }).eq("business_id", business.id).eq("id", campaignId);
 await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_max_cpc_updated", metadata: { appliedFix: "increase_manual_cpc", previousCpcMicros: oldCpcMicros, cpcBidMicros: requestedCpcMicros, verified: true } });
 logGoogleAdsAction("Google Ads CPC fix completed", { stage: "fix_cpc_completed", provider: "google_ads_api", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, verifiedCpcMicros: verification.cpcBidMicros, durationMs: Date.now() - startedAt });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", `Maximum bid updated to ${(requestedCpcMicros / 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" })} and verified in Google Ads.`));
}

export async function addGoogleAdsNegativeKeywordAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 const keyword = text(formData, "keyword");
 const { data: campaign } = await supabase.from("business_google_ads_campaigns").select("google_ads_customer_id,google_ad_group_id,negative_keywords").eq("business_id", business.id).eq("id", campaignId).maybeSingle();
 if (!keyword) redirect(path(slug, "error", "Enter a negative keyword."));
 if (!connection?.accessToken || !campaign?.google_ad_group_id) redirect(path(slug, "error", "This campaign is not ready for negative keyword updates."));
 await appendGoogleAdsNegativeKeyword({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  adGroupId: campaign.google_ad_group_id,
  keyword,
 });
 const negativeKeywords = [...new Set([...(Array.isArray(campaign.negative_keywords) ? campaign.negative_keywords.map(String) : []), keyword])];
 await supabase.from("business_google_ads_campaigns").update({
  negative_keywords: negativeKeywords,
  last_sync_at: new Date().toISOString(),
  updated_by: user.id,
  updated_at: new Date().toISOString(),
 }).eq("business_id", business.id).eq("id", campaignId);
 await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_negative_keyword_added", metadata: { keyword } });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Negative keyword added."));
}

export async function refreshGoogleAdsCampaignsAction(slug: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Connect Google Ads first."));
 const dateFrom = text(formData, "from");
 const dateTo = text(formData, "to");
 const metrics = await fetchGoogleAdsCampaignMetrics({ accessToken: connection.accessToken, customerId: connection.customerId, dateFrom, dateTo, businessId: business.id });
 const byCampaignId = new Map(metrics.map((row) => [row.campaignId, row]));
 const { data: campaigns } = await supabase.from("business_google_ads_campaigns").select("id,google_campaign_id,google_ads_customer_id,status").eq("business_id", business.id).in("status", ["published", "paused", "archived"]);
 const syncedStatuses = await syncPublishedGoogleAdsCampaignStatuses({
  supabase,
  accessToken: connection.accessToken,
  businessId: business.id,
  businessSlug: business.slug,
  userId: user.id,
  connectionStatus: connection.status,
  connectionChoices: connection.customerChoices,
  selectedCustomerId: connection.customerId,
  campaigns: (campaigns ?? []).map((campaign) => ({
   id: String(campaign.id),
   google_campaign_id: campaign.google_campaign_id ?? null,
   google_ads_customer_id: campaign.google_ads_customer_id ?? null,
  })),
 });
 for (const campaign of campaigns ?? []) {
  const metric = campaign.google_campaign_id ? byCampaignId.get(campaign.google_campaign_id) : null;
  const synced = campaign.google_campaign_id ? syncedStatuses.get(campaign.google_campaign_id) : null;
  if (!metric && !synced) continue;
  await supabase.from("business_google_ads_campaigns").update({
   status: synced?.status === "REMOVED" ? "archived" : (synced?.status ?? metric?.status) === "PAUSED" ? "paused" : "published",
   google_campaign_status: synced?.status ?? null,
   google_campaign_primary_status: synced?.primaryStatus ?? null,
   google_campaign_primary_status_reasons: synced?.primaryStatusReasons ?? [],
   google_campaign_resource_name: synced?.campaignResourceName ?? null,
   last_sync_at: new Date().toISOString(),
   updated_by: user.id,
   updated_at: new Date().toISOString(),
  }).eq("business_id", business.id).eq("id", campaign.id);
 }
 await writeGoogleAdsAuditLog({ businessId: business.id, actorUserId: user.id, eventType: "google_ads_metrics_refreshed", metadata: { dateFrom, dateTo, campaignCount: metrics.length } });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Google Ads metrics refreshed."));
}

export async function searchGoogleAdsCampaignLocationsAction(slug: string, campaignId: string, formData: FormData) {
 const { business } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 const query = text(formData, "locationQuery");
 if (!connection?.customerId) redirect(path(slug, "error", "Connect Google Ads first."));
 if (!query) redirect(`/app/${slug}/marketing/google-ads?manageLocations=${encodeURIComponent(campaignId)}`);
 try {
  await searchGoogleAdsGeoTargets({
   accessToken: connection.accessToken,
   customerId: connection.customerId,
   loginCustomerId: connection.loginCustomerId,
   query,
   businessId: business.id,
  });
 } catch (error) {
  const message = error instanceof Error ? error.message : "Google Ads locations could not be searched.";
  redirect(path(slug, "error", message));
 }
 redirect(`/app/${slug}/marketing/google-ads?manageLocations=${encodeURIComponent(campaignId)}&locationQuery=${encodeURIComponent(query)}`);
}

export async function addGoogleAdsCampaignLocationAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Reconnect Google Ads before changing locations."));
 const geoTargetConstant = text(formData, "geoTargetConstant");
 if (!geoTargetConstant) redirect(path(slug, "error", "Choose a valid Google Ads location."));
 const { data: campaign } = await supabase.from("business_google_ads_campaigns")
  .select("id,google_campaign_id,google_ads_customer_id")
  .eq("business_id", business.id)
  .eq("id", campaignId)
  .maybeSingle();
 if (!campaign?.google_campaign_id || !campaign.google_ads_customer_id) redirect(path(slug, "error", "The published campaign could not be found."));
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 const current = await fetchGoogleAdsCampaignLocationTargeting({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  campaignIds: [campaign.google_campaign_id],
  loginCustomerId: mutationAccess.resolvedLoginCustomerId,
  businessId: business.id,
 });
 const currentTargeting = current[0];
 if (currentTargeting?.targetedLocations.some((location) => location.geoTargetConstant === geoTargetConstant)) {
  redirect(path(slug, "error", "That location is already targeted."));
 }
 await addGoogleAdsCampaignLocation({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  loginCustomerIds: mutationAccess.loginCustomerIds,
  campaignId: campaign.google_campaign_id,
  geoTargetConstant,
 });
 const refreshed = await fetchGoogleAdsCampaignLocationTargeting({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  campaignIds: [campaign.google_campaign_id],
  loginCustomerId: mutationAccess.resolvedLoginCustomerId,
  businessId: business.id,
 });
 const latest = refreshed[0];
 await supabase.from("business_google_ads_campaigns").update({
  geo_target_summary: latest?.targetedLocations.length
   ? latest.targetedLocations.slice(0, 3).map((location) => location.canonicalName || location.name).join(", ")
   : "No locations currently configured",
  last_sync_at: new Date().toISOString(),
  updated_by: user.id,
  updated_at: new Date().toISOString(),
 }).eq("business_id", business.id).eq("id", campaignId);
 await writeGoogleAdsAuditLog({
  businessId: business.id,
  campaignId,
  actorUserId: user.id,
  eventType: "google_ads_campaign_location_added",
  metadata: { geoTargetConstant },
 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Campaign location added."));
}

export async function removeGoogleAdsCampaignLocationAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Reconnect Google Ads before changing locations."));
 const criterionResourceName = text(formData, "criterionResourceName");
 if (!criterionResourceName) redirect(path(slug, "error", "That Google Ads location could not be removed."));
 const { data: campaign } = await supabase.from("business_google_ads_campaigns")
  .select("id,google_campaign_id,google_ads_customer_id")
  .eq("business_id", business.id)
  .eq("id", campaignId)
  .maybeSingle();
 if (!campaign?.google_campaign_id || !campaign.google_ads_customer_id) redirect(path(slug, "error", "The published campaign could not be found."));
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 await removeGoogleAdsCampaignLocation({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  loginCustomerIds: mutationAccess.loginCustomerIds,
  criterionResourceName,
 });
 const refreshed = await fetchGoogleAdsCampaignLocationTargeting({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  campaignIds: [campaign.google_campaign_id],
  loginCustomerId: mutationAccess.resolvedLoginCustomerId,
  businessId: business.id,
 });
 const latest = refreshed[0];
 await supabase.from("business_google_ads_campaigns").update({
  geo_target_summary: latest?.targetedLocations.length
   ? latest.targetedLocations.slice(0, 3).map((location) => location.canonicalName || location.name).join(", ")
   : "No locations currently configured",
  last_sync_at: new Date().toISOString(),
  updated_by: user.id,
  updated_at: new Date().toISOString(),
 }).eq("business_id", business.id).eq("id", campaignId);
 await writeGoogleAdsAuditLog({
  businessId: business.id,
  campaignId,
  actorUserId: user.id,
  eventType: "google_ads_campaign_location_removed",
  metadata: { criterionResourceName },
 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Campaign location removed."));
}

export async function runGoogleAdsPermissionDiagnosticAction(slug: string) {
 const { business, user } = await context(slug);
 const diagnostic = await runGoogleAdsPermissionDiagnostic({ businessId: business.id });
 await writeGoogleAdsAuditLog({
  businessId: business.id,
  actorUserId: user.id,
  eventType: "google_ads_permission_diagnostic_run",
  metadata: {
   authenticated_email: diagnostic.authenticatedGoogleAccount.email,
   manager_customer_id: diagnostic.managerCustomerId,
   target_customer_id: diagnostic.targetCustomerId,
   classification: diagnostic.classification,
   checks: diagnostic.checks.map((check) => ({
    key: check.key,
    passed: check.passed,
    http_status: check.httpStatus,
    google_status: check.googleStatus,
    google_message: check.googleMessage,
   })),
  },
 });
 await recordGoogleAdsBetaEvent({
  businessId: business.id,
  actorUserId: user.id,
  eventName: "google_ads_permission_diagnostic_run",
  metadata: {
   business_slug: business.slug,
   classification: diagnostic.classification,
   timestamp: new Date().toISOString(),
  },
 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(`/app/${encodeURIComponent(slug)}/marketing/google-ads?success=${encodeURIComponent("Google Ads access diagnostic refreshed.")}&diagnostic=access`);
}
