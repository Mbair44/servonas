"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { canManageBusiness } from "@/lib/access";
import {
 appendGoogleAdsNegativeKeyword,
 appendGoogleAdsExactMatchKeywords,
 fetchGoogleAdsAdGroupNegativeKeywords,
 fetchGoogleAdsSearchTerms,
 googleAdsSearchTermReviewSnapshotHash,
 normalizeGoogleAdsNegativeKeyword,
 reviewGoogleAdsSearchTermsWithAi,
 addGoogleAdsCampaignLocation,
 buildGoogleAdsCampaignHealth,
 checkGoogleAdsBusinessIssues,
 createGoogleAdsAdGroup,
 discoverGoogleAdsAccounts,
 estimateMonthlyBudgetCents,
 fetchGoogleAdsCampaignLocationTargeting,
 fetchGoogleAdsAdGroupBid,
 fetchGoogleAdsCampaignAdGroupDetails,
 fetchGoogleAdsManualCpcAdGroups,
 fetchGoogleAdsCampaignHealthSnapshots,
 fetchGoogleAdsCampaignStatuses,
 fetchGoogleAdsCampaignMetrics,
 fetchGoogleAdsKeywordReviewSnapshot,
 deriveGoogleAdsKeywordBidRecommendations,
 googleAdsKeywordReviewSnapshotHash,
 googleAdsKeywordBidSafetyCapMicros,
 googleAdsSuggestedStartingBidMicros,
 logGoogleAdsKeywordReviewStage,
 reviewGoogleAdsKeywordsWithAi,
 generateGoogleAdsDraft,
 googleAdsErrorMessage,
 googleAdsRecommendedLandingPages,
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
 updateGoogleAdsKeywordBid,
 updateTenantGoogleAdsSelection,
 disconnectTenantGoogleAds,
 writeGoogleAdsAuditLog,
} from "@/lib/googleAdsManagement";
import { googleAdsBidDollarsToMicros } from "@/lib/googleAdsBid";
import { requireWorkspace } from "@/lib/workspace";

const path = (slug: string, kind: "error" | "success", message: string) =>
 `/app/${encodeURIComponent(slug)}/marketing/google-ads?${kind}=${encodeURIComponent(message)}`;

const metricsPath = (slug: string, from: string, to: string, message: string) =>
 `/app/${encodeURIComponent(slug)}/marketing/google-ads?${new URLSearchParams({ from, to, success: message }).toString()}`;

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const landingPageSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
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
const parseAds = (formData: FormData) => {
 const headlines = limitedLines(formData, "headlines", 15);
 const descriptions = limitedLines(formData, "descriptions", 4);
 const secondaryHeadlines = limitedLines(formData, "secondaryHeadlines", 15);
 const secondaryDescriptions = limitedLines(formData, "secondaryDescriptions", 4);
 const destinationUrl = text(formData, "destinationUrl");
 const secondaryDestinationUrl = text(formData, "secondaryDestinationUrl") || destinationUrl;
 return [
  { finalUrl: destinationUrl, headlines, descriptions },
  ...(secondaryHeadlines.length || secondaryDescriptions.length ? [{ finalUrl: secondaryDestinationUrl, headlines: secondaryHeadlines, descriptions: secondaryDescriptions }] : []),
 ];
};
const legacyAdGroupFromCampaign = (campaign: any) => ({
 name: campaign.ad_group_name,
 destinationUrl: campaign.destination_url,
 keywords: Array.isArray(campaign.keywords) ? campaign.keywords.map(String) : [],
 negativeKeywords: Array.isArray(campaign.negative_keywords) ? campaign.negative_keywords.map(String) : [],
 ads: [{
  finalUrl: campaign.destination_url,
  headlines: Array.isArray(campaign.headlines) ? campaign.headlines.map(String) : [],
  descriptions: Array.isArray(campaign.descriptions) ? campaign.descriptions.map(String) : [],
 }],
});

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
 const { data: insertedCampaign, error } = await supabase.from("business_google_ads_campaigns").insert({
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
 }).select("id").single();
 if (error) redirect(path(slug, "error", "The Google Ads draft could not be saved. Apply the Google Ads migration first."));
 await supabase.from("business_google_ads_ad_groups").insert({
  business_id: business.id,
  campaign_id: insertedCampaign.id,
  service_id: service?.id ?? null,
  inventory_item_id: inventory?.id ?? null,
  google_ads_customer_id: connection.customerId,
  ad_group_name: draft.adGroupName,
  destination_url: draft.destinationUrl,
  status: "draft",
  keywords: draft.keywords,
  negative_keywords: draft.negativeKeywords,
  ads: [{ finalUrl: draft.destinationUrl, headlines: draft.headlines, descriptions: draft.descriptions }],
  created_by: user.id,
  updated_by: user.id,
 });
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
 const ads = parseAds(formData);
 const headlines = ads[0]?.headlines ?? [];
 const descriptions = ads[0]?.descriptions ?? [];
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
 const adGroupName = text(formData, "adGroupName");
 const { data: existingDraftAdGroup } = await supabase.from("business_google_ads_ad_groups").select("id").eq("business_id", business.id).eq("campaign_id", campaignId).eq("ad_group_name", adGroupName).maybeSingle();
 if (existingDraftAdGroup?.id) {
  await supabase.from("business_google_ads_ad_groups").update({
   destination_url: text(formData, "destinationUrl"),
   keywords,
   negative_keywords: negatives,
   ads,
   updated_by: user.id,
   updated_at: new Date().toISOString(),
  }).eq("business_id", business.id).eq("id", existingDraftAdGroup.id);
 } else {
  await supabase.from("business_google_ads_ad_groups").insert({
   business_id: business.id,
   campaign_id: campaignId,
   google_ads_customer_id: null,
   ad_group_name: adGroupName,
   destination_url: text(formData, "destinationUrl"),
   keywords,
   negative_keywords: negatives,
   ads,
   created_by: user.id,
   updated_by: user.id,
  });
 }
 await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, campaignId, eventName: "google_ads_campaign_edited", metadata: { business_slug: business.slug, timestamp: new Date().toISOString() } });
 await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_draft_updated" });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Google Ads draft updated."));
}

export async function createGoogleAdsAdGroupAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const [{ data: campaign }, { data: website }] = await Promise.all([
  supabase.from("business_google_ads_campaigns").select("*").eq("business_id", business.id).eq("id", campaignId).maybeSingle(),
  supabase.from("business_website_settings").select("public_slug,custom_domain,status,domain_status").eq("business_id", business.id).maybeSingle(),
 ]);
 if (!campaign) redirect(path(slug, "error", "The campaign could not be found."));
 const adGroupName = text(formData, "adGroupName");
 const destinationUrl = text(formData, "destinationUrl");
 const keywords = lines(formData, "keywords");
 const negativeKeywords = lines(formData, "negativeKeywords");
 const ads = parseAds(formData);
 const draftAdGroupId = text(formData,"draftAdGroupId");
 if (!adGroupName || !destinationUrl || !keywords.length) redirect(path(slug, "error", "Add an ad group name, destination URL, and at least one keyword."));
 if(ads[0].headlines.length<3||ads[0].descriptions.length<2||ads[0].headlines.some(value=>value.length>30)||ads[0].descriptions.some(value=>value.length>90))redirect(path(slug,"error","Servonas needs at least 3 valid headlines and 2 valid descriptions before creating this ad group."));
 const record={
  business_id: business.id,
  campaign_id: campaignId,
  google_ads_customer_id: campaign.google_ads_customer_id ?? null,
  google_campaign_id: campaign.google_campaign_id ?? null,
  ad_group_name: adGroupName,
  destination_url: destinationUrl,
  keywords,
  negative_keywords: negativeKeywords,
  ads,
  status: "draft",
  created_by: user.id,
  updated_by: user.id,
  updated_at:new Date().toISOString(),
 };
 const {data:savedAdGroup,error:saveError}=draftAdGroupId
  ?await supabase.from("business_google_ads_ad_groups").update(record).eq("id",draftAdGroupId).eq("business_id",business.id).eq("campaign_id",campaignId).eq("status","draft").select("id").maybeSingle()
  :await supabase.from("business_google_ads_ad_groups").insert(record).select("id").single();
 if(saveError||!savedAdGroup)redirect(path(slug,"error","The reviewed ad group could not be saved."));
 if (campaign.google_campaign_id && campaign.google_ads_customer_id) {
  const connection = await loadTenantGoogleAdsAccess(business.id);
  if (!connection?.accessToken) redirect(path(slug, "error", "Reconnect Google Ads before adding a live ad group."));
  const access = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
  const published = await createGoogleAdsAdGroup({
   accessToken: connection.accessToken,
   customerId: campaign.google_ads_customer_id,
   loginCustomerIds: access.loginCustomerIds,
   biddingStrategy: campaign.bidding_strategy === "MANUAL_CPC" ? "MANUAL_CPC" : "MAXIMIZE_CLICKS",
   manualCpcBidMicros: Number(campaign.manual_cpc_bid_micros ?? 0) || null,
   campaignId: campaign.google_campaign_id,
   adGroup: { name: adGroupName, destinationUrl, keywords, negativeKeywords, ads },
  });
  if (published.adGroupId) {
   await supabase.from("business_google_ads_ad_groups").update({
    google_ad_group_id: published.adGroupId,
    status: "published",
    updated_by: user.id,
    updated_at: new Date().toISOString(),
   }).eq("business_id", business.id).eq("id", savedAdGroup.id);
  }
 }
 await writeGoogleAdsAuditLog({
  businessId: business.id,
  campaignId,
  actorUserId: user.id,
  eventType: "google_ads_ad_group_created",
  metadata: {
   adGroupName,
   destinationUrl,
   landingPageRecommendations: googleAdsRecommendedLandingPages({
    website: website ? {
     publicSlug: website.public_slug ?? null,
     customDomain: website.custom_domain ?? null,
     status: website.status ?? null,
     domainStatus: website.domain_status ?? null,
     heroHeading: null,
     heroSubheading: null,
     aboutText: null,
    } : null,
    businessSlug: business.slug,
    businessName: business.name,
   }),
  },
 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Ad group added."));
}

export async function prepareGoogleAdsAdGroupAction(slug:string,campaignId:string,formData:FormData){
 const {supabase,business,user}=await context(slug);
 const target=text(formData,"advertisingTarget"),[kind,id]=target.split(":");
 if(!id||!["service","inventory","category"].includes(kind))redirect(path(slug,"error","Choose what you want to advertise."));
 const [{data:campaign},{data:website},{data:territories},{data:service},{data:inventory},{data:category},{data:categoryPage},{data:categoryItems},{data:existingGroups}]=await Promise.all([
  supabase.from("business_google_ads_campaigns").select("*").eq("business_id",business.id).eq("id",campaignId).maybeSingle(),
  supabase.from("business_website_settings").select("public_slug,custom_domain,status,domain_status,hero_heading,hero_subheading,about_text").eq("business_id",business.id).maybeSingle(),
  supabase.from("workforce_territories").select("name").eq("business_id",business.id).eq("is_active",true).order("name"),
  kind==="service"?supabase.from("services").select("id,name,description").eq("business_id",business.id).eq("id",id).eq("active",true).eq("is_deleted",false).maybeSingle():Promise.resolve({data:null}),
  kind==="inventory"?supabase.from("inventory_items").select("id,name,description").eq("business_id",business.id).eq("id",id).eq("active",true).maybeSingle():Promise.resolve({data:null}),
  kind==="category"?supabase.from("rental_inventory_categories").select("id,name").eq("business_id",business.id).eq("id",id).maybeSingle():Promise.resolve({data:null}),
  kind==="category"?supabase.from("category_website_pages").select("slug,status,title,intro,seo_title,meta_description").eq("business_id",business.id).eq("category_id",id).maybeSingle():Promise.resolve({data:null}),
  kind==="category"?supabase.from("inventory_items").select("name,description,daily_price_cents").eq("business_id",business.id).eq("category_id",id).eq("active",true):Promise.resolve({data:[]}),
  supabase.from("business_google_ads_ad_groups").select("id,ad_group_name,keywords,status").eq("business_id",business.id).eq("campaign_id",campaignId).neq("status","archived"),
 ]);
 if(!campaign)redirect(path(slug,"error","The campaign could not be found."));
 const chosen:any=service??inventory??category;if(!chosen)redirect(path(slug,"error","That service is not available for this business."));
 const serviceName=String(categoryPage?.title||chosen.name),productContext=(categoryItems??[]).map((item:any)=>`${item.name}${item.description?`: ${item.description}`:""}`).join(" | ").slice(0,3000);
 const websiteInput=website?{publicSlug:website.public_slug??null,customDomain:website.custom_domain??null,status:website.status??null,domainStatus:website.domain_status??null,heroHeading:categoryPage?.title??website.hero_heading??null,heroSubheading:categoryPage?.intro??website.hero_subheading??null,aboutText:[categoryPage?.meta_description,productContext,website.about_text].filter(Boolean).join(" | ")||null}:null;
 const recommendations=googleAdsRecommendedLandingPages({website:websiteInput,businessSlug:business.slug,businessName:business.name,serviceName,dedicatedPage:categoryPage?{slug:categoryPage.slug,published:categoryPage.status==="published"}:null});
 const dedicatedRoot=website?.custom_domain&&website.domain_status==="connected"?`https://${website.custom_domain}`:website?.public_slug&&website.status==="published"?`${(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||"https://servonas.com").replace(/\/$/,"")}/sites/${website.public_slug}`:null;
 const destinationUrl=categoryPage?.status==="published"&&dedicatedRoot?`${dedicatedRoot}/${categoryPage.slug}`:recommendations.find(entry=>entry.recommended)?.url??campaign.destination_url;
 const draft=await generateGoogleAdsDraft({businessId:business.id,businessName:business.name,industry:business.industry_profile,userId:user.id,service:{id:chosen.id,name:serviceName,description:String(chosen.description??categoryPage?.intro??productContext??"")||null},rentalItem:null,website:websiteInput,businessLocation:{city:business.city??null,state:business.state??null},serviceAreas:(territories??[]).map((row:any)=>String(row.name)),geoTargetType:(campaign.geo_target_type??"service_area") as any,geoValues:Array.isArray(campaign.geo_target_config?.values)?campaign.geo_target_config.values.map(String):[],radiusMiles:Number(campaign.geo_target_config?.radiusMiles)||null,dailyBudgetDollars:Number(campaign.daily_budget_micros??0)/1_000_000,biddingStrategy:campaign.bidding_strategy==="MANUAL_CPC"?"MANUAL_CPC":"MAXIMIZE_CLICKS",manualCpcBidDollars:Number(campaign.manual_cpc_bid_micros??0)/1_000_000});
 const existingKeywords=new Set((existingGroups??[]).flatMap((group:any)=>Array.isArray(group.keywords)?group.keywords:[]).map((value:any)=>String(value).trim().toLowerCase()));
 const keywords=draft.keywords.filter(value=>!existingKeywords.has(value.toLowerCase()));
 const overlapCount=draft.keywords.length-keywords.length;
 const negatives=[...new Set([...(Array.isArray(campaign.negative_keywords)?campaign.negative_keywords.map(String):[]),...draft.negativeKeywords])];
 const draftRecord={business_id:business.id,campaign_id:campaignId,service_id:service?.id??null,inventory_item_id:inventory?.id??null,google_ads_customer_id:campaign.google_ads_customer_id??null,google_campaign_id:campaign.google_campaign_id??null,ad_group_name:draft.adGroupName,destination_url:destinationUrl,keywords:keywords.length?keywords:draft.keywords,negative_keywords:negatives,ads:[{finalUrl:destinationUrl,headlines:draft.headlines,descriptions:draft.descriptions}],status:"draft",updated_by:user.id,updated_at:new Date().toISOString()};
 const priorDraft=(existingGroups??[]).find((group:any)=>group.status==="draft"&&String(group.ad_group_name).toLowerCase()===draft.adGroupName.toLowerCase());
 const {data:saved,error}=priorDraft?await supabase.from("business_google_ads_ad_groups").update(draftRecord).eq("business_id",business.id).eq("campaign_id",campaignId).eq("id",priorDraft.id).select("id").single():await supabase.from("business_google_ads_ad_groups").insert({...draftRecord,created_by:user.id}).select("id").single();
 if(error||!saved)redirect(path(slug,"error","Servonas could not prepare this ad group."));
 await writeGoogleAdsAuditLog({businessId:business.id,campaignId,actorUserId:user.id,eventType:"google_ads_ad_group_draft_prepared",metadata:{targetType:kind,targetId:id,destinationUrl,overlapCount,aiGenerated:draft.aiGenerated}});
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(`/app/${encodeURIComponent(slug)}/marketing/google-ads?adGroupDraft=${encodeURIComponent(saved.id)}&success=${encodeURIComponent(`Servonas prepared your ${serviceName} ad group. Nothing has been published yet.`)}`);
}

export async function createGoogleAdsCategoryLandingPageAction(slug:string,categoryId:string){
 const {supabase,business}=await context(slug);
 const [{data:category},{data:existing},{count:itemCount},{data:website}]=await Promise.all([
  supabase.from("rental_inventory_categories").select("id,name").eq("business_id",business.id).eq("id",categoryId).maybeSingle(),
  supabase.from("category_website_pages").select("id,status,slug").eq("business_id",business.id).eq("category_id",categoryId).maybeSingle(),
  supabase.from("inventory_items").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("category_id",categoryId).eq("active",true),
  supabase.from("business_website_settings").select("status").eq("business_id",business.id).maybeSingle(),
 ]);
 if(!category)redirect(path(slug,"error","That category could not be found."));
 if(!itemCount)redirect(path(slug,"error","Add an active item to this category before creating its landing page."));
 if(website?.status!=="published")redirect(path(slug,"error","Publish your business website before creating an ad landing page."));
 const now=new Date().toISOString(),publishedValues={status:"published",published_at:now,updated_at:now};
 if(existing){
  const {error}=await supabase.from("category_website_pages").update(publishedValues).eq("business_id",business.id).eq("id",existing.id);
  if(error)redirect(path(slug,"error","The category landing page could not be published."));
 }else{
  const {error}=await supabase.from("category_website_pages").insert({business_id:business.id,category_id:category.id,slug:landingPageSlug(category.name),title:category.name,intro:`Browse all ${category.name.toLowerCase()} available from ${business.name}, then check availability for your event date.`,seo_title:`${category.name} | ${business.name}`,meta_description:`Explore ${category.name.toLowerCase()} from ${business.name} and check availability online.`,...publishedValues});
  if(error)redirect(path(slug,"error",error.code==="23505"?"A landing page already uses that URL.":"The category landing page could not be created."));
 }
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 revalidatePath(`/sites/[siteSlug]/[promotionSlug]`,"page");
 revalidatePath(`/sites/domain/[domain]/[promotionSlug]`,"page");
 redirect(path(slug,"success",`${category.name} landing page created and published. You can now use it for a new ad group.`));
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
 const { data: savedAdGroups } = await supabase.from("business_google_ads_ad_groups").select("*").eq("business_id", business.id).eq("campaign_id", campaignId).order("created_at");
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
   dailyBudgetMicros: Number(campaign.daily_budget_micros),
   biddingStrategy: campaign.bidding_strategy === "MANUAL_CPC" ? "MANUAL_CPC" : "MAXIMIZE_CLICKS",
   manualCpcBidMicros: Number(campaign.manual_cpc_bid_micros ?? 0) || null,
   adGroups: (savedAdGroups?.length ? savedAdGroups : [legacyAdGroupFromCampaign(campaign)]).map((adGroup: any) => ({
    name: adGroup.ad_group_name ?? adGroup.name,
    destinationUrl: adGroup.destination_url ?? adGroup.destinationUrl,
    keywords: Array.isArray(adGroup.keywords) ? adGroup.keywords.map(String) : [],
    negativeKeywords: Array.isArray(adGroup.negative_keywords ?? adGroup.negativeKeywords) ? (adGroup.negative_keywords ?? adGroup.negativeKeywords).map(String) : [],
    ads: Array.isArray(adGroup.ads) ? adGroup.ads.map((ad: any) => ({
     finalUrl: typeof ad?.finalUrl === "string" ? ad.finalUrl : (adGroup.destination_url ?? campaign.destination_url),
     headlines: Array.isArray(ad?.headlines) ? ad.headlines.map(String) : [],
     descriptions: Array.isArray(ad?.descriptions) ? ad.descriptions.map(String) : [],
    })) : [],
   })),
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
  for (const [index, adGroup] of (savedAdGroups?.length ? savedAdGroups : []).entries()) {
   const publishedAdGroup = published.adGroups?.[index];
   if (!publishedAdGroup?.id) continue;
   await supabase.from("business_google_ads_ad_groups").update({
    google_ads_customer_id: connection.customerId,
    google_campaign_id: published.campaignId,
    google_ad_group_id: publishedAdGroup.id,
    status: "published",
    updated_by: user.id,
    updated_at: new Date().toISOString(),
   }).eq("business_id", business.id).eq("id", adGroup.id);
  }
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
 const cpcActionId = /^[a-z0-9-]{8,100}$/i.test(text(formData, "cpcActionId")) ? text(formData, "cpcActionId") : randomUUID();
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) {
  logGoogleAdsActionError("Google Ads CPC fix blocked", { stage: "fix_cpc_blocked", implementation: "action_specific_manual_cpc_v2", cpcActionId, action: "update_manual_cpc", businessId: business.id, campaignId, adGroupId: null, blockingReasons: ["google_ads_connection_or_selected_customer_missing"] });
  redirect(path(slug, "error", "Reconnect Google Ads before updating campaign settings."));
 }
 // This mapping read deliberately excludes local bidding fields. Google Ads is
 // authoritative for the current campaign strategy and live ad-group bid.
 const { data: campaign, error: campaignError } = await supabase.from("business_google_ads_campaigns").select("google_ads_customer_id,google_campaign_id").eq("business_id", business.id).eq("id", campaignId).maybeSingle();
 if (campaignError || !campaign?.google_campaign_id || !campaign.google_ads_customer_id) {
  logGoogleAdsActionError("Google Ads CPC fix blocked", { stage: "fix_cpc_blocked", implementation: "action_specific_manual_cpc_v2", cpcActionId, action: "update_manual_cpc", businessId: business.id, campaignId, adGroupId: null, blockingReasons: [campaignError ? "campaign_read_failed" : "campaign_google_identifiers_missing"], errorCode: campaignError?.code ?? null, errorMessage: campaignError?.message ?? null });
  redirect(path(slug, "error", "The selected campaign could not be verified."));
 }
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 if (String(formData.get("confirmCpcFix") ?? "") !== "apply") {
  logGoogleAdsActionError("Google Ads CPC fix blocked", { stage: "fix_cpc_blocked", implementation: "action_specific_manual_cpc_v2", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, blockingReasons: ["confirmation_missing"] });
  redirect(path(slug, "error", "Confirm the max CPC change before applying it."));
 }
 const requestedCpcMicros = selectedMaximumBidMicros(formData);
 if (!requestedCpcMicros) {
  logGoogleAdsActionError("Google Ads CPC fix blocked", { stage: "fix_cpc_blocked", implementation: "action_specific_manual_cpc_v2", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, blockingReasons: ["requested_cpc_invalid"] });
  redirect(path(slug, "error", "Enter a positive maximum bid using dollars and up to two decimal places."));
 }
 const startedAt = Date.now();
 logGoogleAdsAction("Google Ads CPC fix started", { stage: "fix_cpc_started", implementation: "action_specific_manual_cpc_v2", cpcActionId, businessId: business.id, campaignId: campaign.google_campaign_id, requestedCpcMicros });
 const selectedCustomerVerified = connection.customerId === campaign.google_ads_customer_id || connection.customerChoices.some((choice: { id: string }) => choice.id === campaign.google_ads_customer_id);
 logGoogleAdsAction("Google Ads CPC readiness checked", { stage: "recommended_setting_readiness_check", cpcActionId, action: "update_manual_cpc", implementation: "action_specific_manual_cpc_v2", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, campaignVerified: true, adGroupVerified: null, biddingStrategy: null, currentCpcMicros: null, requestedCpcMicros, requestedCpcValid: true, selectedCustomerVerified, blockingReasons: selectedCustomerVerified ? [] : ["selected_customer_not_verified"] });
 if (!selectedCustomerVerified) {
  logGoogleAdsActionError("Google Ads CPC readiness failed", { stage: "fix_cpc_blocked", readinessStage: "recommended_setting_update_readiness_failed", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, authorized: true, campaignVerified: true, adGroupVerified: false, biddingStrategyVerified: false, currentCpcVerified: false, requestedCpcValid: true, blockingReasons: ["selected_customer_not_verified"] });
  redirect(path(slug, "error", "The selected Google Ads customer could not be verified for this campaign."));
 }
 const liveAdGroups = await fetchGoogleAdsManualCpcAdGroups({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, loginCustomerId: mutationAccess.resolvedLoginCustomerId, businessId: business.id });
 if (!liveAdGroups.length || liveAdGroups.some((adGroup) => adGroup.biddingStrategyType !== "MANUAL_CPC")) {
  const blockingReasons = !liveAdGroups.length ? ["target_ad_group_not_found"] : ["campaign_not_manual_cpc"];
  logGoogleAdsActionError("Google Ads CPC readiness failed", { stage: "fix_cpc_blocked", readinessStage: "recommended_setting_update_readiness_failed", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, authorized: true, campaignVerified: true, adGroupVerified: liveAdGroups.length > 0, biddingStrategyVerified: false, currentCpcVerified: false, requestedCpcValid: true, blockingReasons });
  redirect(path(slug, "error", !liveAdGroups.length ? "Servonas could not verify the target ad group." : "This campaign is not using Manual CPC."));
 }
 const oldCpcMicros = Math.min(...liveAdGroups.map((adGroup) => adGroup.cpcBidMicros).filter((bid) => bid > 0));
 const matchingAdGroups = liveAdGroups.filter((adGroup) => adGroup.cpcBidMicros === oldCpcMicros);
 if (!Number.isFinite(oldCpcMicros) || matchingAdGroups.length !== 1) {
  logGoogleAdsActionError("Google Ads CPC readiness failed", { stage: "fix_cpc_blocked", readinessStage: "recommended_setting_update_readiness_failed", action: "update_manual_cpc", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: null, authorized: true, campaignVerified: true, adGroupVerified: true, biddingStrategyVerified: true, currentCpcVerified: false, requestedCpcValid: true, blockingReasons: ["current_cpc_not_uniquely_verified"] });
  redirect(path(slug, "error", "Servonas could not read one verified current maximum bid for the target ad group."));
 }
 const targetAdGroup = matchingAdGroups[0]!;
 logGoogleAdsAction("Google Ads CPC fix ad group resolved", { stage: "fix_cpc_ad_group_resolved", cpcActionId, businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, durationMs: Date.now() - startedAt });
 logGoogleAdsAction("Google Ads CPC fix mutation started", { stage: "fix_cpc_mutation_started", cpcActionId, businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, resourceType: "ad_group", resourceName: `customers/${campaign.google_ads_customer_id}/adGroups/${targetAdGroup.id}`, updateFields: ["cpc_bid_micros"], customerId: campaign.google_ads_customer_id });
 const mutation = await updateGoogleAdsAdGroupBid({
  accessToken: connection.accessToken,
  customerId: campaign.google_ads_customer_id,
  loginCustomerIds: mutationAccess.loginCustomerIds,
  adGroupId: targetAdGroup.id,
  cpcBidMicros: requestedCpcMicros,
 });
 logGoogleAdsAction("Google Ads CPC fix mutation completed", { stage: "fix_cpc_mutation_completed", cpcActionId, provider: "google_ads_api", endpointHost: "googleads.googleapis.com", endpointPath: `/customers/${campaign.google_ads_customer_id}/adGroups:mutate`, method: "POST", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, updateMask: "cpc_bid_micros", returnedResourceName: mutation.resourceName, mutationResultCount: mutation.mutationResultCount, partialFailure: mutation.partialFailure, httpStatus: mutation.httpStatus, googleRequestId: mutation.googleRequestId, durationMs: Date.now() - startedAt });
 logGoogleAdsAction("Google Ads CPC fix verification started", { stage: "fix_cpc_verify_started", cpcActionId, provider: "google_ads_api", endpointHost: "googleads.googleapis.com", endpointPath: `/customers/${campaign.google_ads_customer_id}/googleAds:searchStream`, method: "POST", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, requestedCpcMicros, requestType: "focused_ad_group_bid_verification" });
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
 logGoogleAdsAction("Google Ads CPC fix completed", { stage: "fix_cpc_completed", cpcActionId, provider: "google_ads_api", businessId: business.id, campaignId: campaign.google_campaign_id, adGroupId: targetAdGroup.id, oldCpcMicros, requestedCpcMicros, verifiedCpcMicros: verification.cpcBidMicros, durationMs: Date.now() - startedAt });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", `Maximum bid updated to ${(requestedCpcMicros / 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" })} and verified in Google Ads.`));
}

export async function applyGoogleAdsKeywordBidRecommendationAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 if (text(formData, "confirmKeywordBid") !== "apply") redirect(path(slug, "error", "Review the bid change and confirm before applying it."));
 const keywordIds = [...new Set(formData.getAll("keywordIds").map(String).map((value) => value.trim()).filter(Boolean))];
 const requestedBidMicros = googleAdsBidDollarsToMicros(text(formData, "maximumBidDollars"));
 if (!keywordIds.length) redirect(path(slug, "error", "Select at least one keyword before updating bids."));
 if (!requestedBidMicros || requestedBidMicros > googleAdsKeywordBidSafetyCapMicros) redirect(path(slug, "error", `Enter a positive maximum bid at or below ${(googleAdsKeywordBidSafetyCapMicros / 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`));
 const connection = await loadTenantGoogleAdsAccess(business.id);
 const [{ data: campaign }, { data: territories }] = await Promise.all([
  supabase.from("business_google_ads_campaigns").select("campaign_name,google_campaign_id,google_ads_customer_id,daily_budget_micros").eq("business_id", business.id).eq("id", campaignId).maybeSingle(),
  supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name"),
 ]);
 if (!connection?.customerId || !campaign?.google_campaign_id || !campaign.google_ads_customer_id) redirect(path(slug, "error", "Reconnect Google Ads before applying this recommendation."));
 const access = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 const to = new Date().toISOString().slice(0, 10);
 const fromDate = new Date(`${to}T00:00:00.000Z`); fromDate.setUTCDate(fromDate.getUTCDate() - 29);
 const snapshot = await fetchGoogleAdsKeywordReviewSnapshot({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, campaignName: campaign.campaign_name ?? null, dailyBudgetMicros: campaign.daily_budget_micros ?? null, industry: business.industry_profile ?? null, locations: (territories ?? []).map((territory) => territory.name), dateFrom: fromDate.toISOString().slice(0, 10), dateTo: to, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id });
 if (snapshot.campaign.biddingStrategy !== "MANUAL_CPC") redirect(path(slug, "error", "This campaign uses automated bidding, so Servonas cannot safely change individual keyword bids."));
 const selectedKeywords = snapshot.keywords.filter((keyword) => keywordIds.includes(keyword.id) && !keyword.negative && keyword.status === "ENABLED" && keyword.adGroupId && keyword.cpcBidMicros && requestedBidMicros > keyword.cpcBidMicros);
 if (selectedKeywords.length !== keywordIds.length) redirect(path(slug, "error", "One or more selected keywords no longer have a verified lower Manual CPC bid. Review keywords again."));
 try {
  const mutations = await Promise.all(selectedKeywords.map((keyword) => updateGoogleAdsKeywordBid({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, loginCustomerIds: access.loginCustomerIds, adGroupId: keyword.adGroupId!, keywordId: keyword.id, cpcBidMicros: requestedBidMicros })));
  const verifiedSnapshot = await fetchGoogleAdsKeywordReviewSnapshot({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, campaignName: campaign.campaign_name ?? null, dailyBudgetMicros: campaign.daily_budget_micros ?? null, industry: business.industry_profile ?? null, locations: (territories ?? []).map((territory) => territory.name), dateFrom: fromDate.toISOString().slice(0, 10), dateTo: to, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id });
  if (selectedKeywords.some((keyword) => verifiedSnapshot.keywords.find((current) => current.id === keyword.id)?.cpcBidMicros !== requestedBidMicros)) throw new Error("Google Ads did not verify every requested keyword bid.");
  await Promise.all(selectedKeywords.map((keyword, index) => writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_keyword_bid_applied", metadata: { googleCustomerId: campaign.google_ads_customer_id, googleCampaignId: campaign.google_campaign_id, adGroupId: keyword.adGroupId, keywordId: keyword.id, keyword: keyword.text, oldBidMicros: keyword.cpcBidMicros, newBidMicros: requestedBidMicros, recommendationSource: "servonas_ai_keyword_review", googleMutationResult: mutations[index] } })));
 } catch (error) {
  await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_keyword_bid_apply_failed", metadata: { googleCustomerId: campaign.google_ads_customer_id, googleCampaignId: campaign.google_campaign_id, keywordIds, recommendationSource: "servonas_ai_keyword_review", errorType: error instanceof Error ? error.name : "unknown" } });
  redirect(path(slug, "error", "Google Ads could not apply this keyword bid. No change was recorded as applied."));
 }
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Keyword bid updated and verified in Google Ads."));
}

export async function applyGoogleAdsExactMatchRecommendationAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 if (text(formData, "confirmExactMatch") !== "apply") redirect(path(slug, "error", "Review the exact-match keywords and confirm before adding them."));
 const keywordIds = [...new Set(formData.getAll("keywordIds").map(String).map((value) => value.trim()).filter(Boolean))];
 if (!keywordIds.length) redirect(path(slug, "error", "Select at least one keyword to add as exact match."));
 const connection = await loadTenantGoogleAdsAccess(business.id);
 const [{ data: campaign }, { data: territories }] = await Promise.all([
  supabase.from("business_google_ads_campaigns").select("campaign_name,google_campaign_id,google_ads_customer_id,daily_budget_micros").eq("business_id", business.id).eq("id", campaignId).maybeSingle(),
  supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name"),
 ]);
 if (!connection?.accessToken || !campaign?.google_campaign_id || !campaign.google_ads_customer_id) redirect(path(slug, "error", "Reconnect Google Ads before adding exact-match keywords."));
 const access = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 const to = new Date().toISOString().slice(0, 10);
 const fromDate = new Date(`${to}T00:00:00.000Z`); fromDate.setUTCDate(fromDate.getUTCDate() - 29);
 const snapshotInput = { accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, campaignName: campaign.campaign_name ?? null, dailyBudgetMicros: campaign.daily_budget_micros ?? null, industry: business.industry_profile ?? null, locations: (territories ?? []).map((territory) => territory.name), dateFrom: fromDate.toISOString().slice(0, 10), dateTo: to, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id };
 const snapshot = await fetchGoogleAdsKeywordReviewSnapshot(snapshotInput);
 const normalizeKeyword = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
 const selected = snapshot.keywords.filter((keyword) => keywordIds.includes(keyword.id) && !keyword.negative && keyword.status === "ENABLED" && keyword.adGroupId && keyword.matchType !== "EXACT");
 if (selected.length !== keywordIds.length) redirect(path(slug, "error", "One or more selected keywords are no longer active phrase or broad-match keywords. Review keywords again."));
 const duplicates = new Set(snapshot.keywords.filter((keyword) => !keyword.negative && keyword.matchType === "EXACT").map((keyword) => normalizeKeyword(keyword.text)));
 const pending = selected.filter((keyword) => !duplicates.has(normalizeKeyword(keyword.text)));
 if (!pending.length) redirect(path(slug, "success", "Those exact-match keywords already exist in Google Ads."));
 try {
  const mutation = await appendGoogleAdsExactMatchKeywords({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, loginCustomerIds: access.loginCustomerIds, keywords: pending.map((keyword) => ({ adGroupId: keyword.adGroupId!, text: keyword.text })) });
  const verified = await fetchGoogleAdsKeywordReviewSnapshot(snapshotInput);
  if (pending.some((keyword) => !verified.keywords.some((current) => !current.negative && current.matchType === "EXACT" && normalizeKeyword(current.text) === normalizeKeyword(keyword.text)))) throw new Error("Google Ads did not verify every exact-match keyword.");
  await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_exact_match_keywords_added", metadata: { googleCustomerId: campaign.google_ads_customer_id, googleCampaignId: campaign.google_campaign_id, keywords: pending.map((keyword) => ({ adGroupId: keyword.adGroupId, keyword: keyword.text, oldMatchType: keyword.matchType, newMatchType: "EXACT" })), recommendationSource: "servonas_ai_keyword_review", googleMutationResult: mutation } });
 } catch (error) {
  await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_exact_match_keywords_add_failed", metadata: { googleCustomerId: campaign.google_ads_customer_id, googleCampaignId: campaign.google_campaign_id, keywordIds, recommendationSource: "servonas_ai_keyword_review", errorType: error instanceof Error ? error.name : "unknown" } });
  redirect(path(slug, "error", "Google Ads could not add these exact-match keywords. No change was recorded as applied."));
 }
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", `Added ${pending.length} exact-match keyword${pending.length === 1 ? "" : "s"} and verified Google Ads.`));
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

export async function reviewGoogleAdsSearchTermsAction(slug: string, campaignId: string, formData?: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId || !process.env.OPENAI_API_KEY?.trim()) redirect(path(slug, "error", "Connect Google Ads and configure AI review before reviewing search terms."));
 const [{ data: campaign }, { data: territories }, { data: services }] = await Promise.all([
  supabase.from("business_google_ads_campaigns").select("id,campaign_name,google_campaign_id,google_ads_customer_id").eq("business_id", business.id).eq("id", campaignId).maybeSingle(),
  supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name"),
  supabase.from("services").select("name").eq("business_id", business.id).eq("active", true).eq("is_deleted", false).order("name"),
 ]);
 if (!campaign?.google_campaign_id || !campaign.google_ads_customer_id) redirect(path(slug, "error", "The published campaign could not be found."));
 const access = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 const to = new Date().toISOString().slice(0, 10); const fromDate = new Date(`${to}T00:00:00.000Z`); fromDate.setUTCDate(fromDate.getUTCDate() - 29);
 const dateFrom = fromDate.toISOString().slice(0, 10);
 try {
  const [terms, negatives] = await Promise.all([
   fetchGoogleAdsSearchTerms({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignIds: [campaign.google_campaign_id], dateFrom, dateTo: to, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id }),
   fetchGoogleAdsAdGroupNegativeKeywords({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id }),
  ]);
  const snapshot = { generatedAt: new Date().toISOString(), dateFrom, dateTo: to, business: { industry: business.industry_profile ?? null, services: (services ?? []).map((service: { name: string }) => service.name), locations: (territories ?? []).map((territory: { name: string }) => territory.name) }, campaign: { id: campaign.google_campaign_id, name: campaign.campaign_name ?? null, goal: "Generate leads for this business" }, currentNegativeKeywords: negatives.map((negative) => ({ text: negative.text, matchType: negative.matchType })), terms };
  const snapshotHash = googleAdsSearchTermReviewSnapshotHash(snapshot);
  const forceReview = formData?.get("force") === "true";
  const metadata = { businessId: business.id, googleCustomerId: campaign.google_ads_customer_id, googleCampaignId: campaign.google_campaign_id, snapshotHash, searchTermCount: terms.length, dateFrom, dateTo: to, model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini" };
  logGoogleAdsKeywordReviewStage("google_ads_search_term_review_requested", metadata);
  const { data: prior } = await supabase.from("business_google_ads_audit_log").select("metadata").eq("business_id", business.id).eq("campaign_id", campaign.id).eq("event_type", "google_ads_search_term_review_generated").order("created_at", { ascending: false }).limit(20);
  const cached = forceReview ? null : (prior ?? []).find((entry: any) => entry.metadata?.snapshotHash === snapshotHash);
  if (cached) { logGoogleAdsKeywordReviewStage("google_ads_search_term_review_cache_hit", metadata); redirect(path(slug, "success", "Servonas reused the current search-term review.")); }
  logGoogleAdsKeywordReviewStage("google_ads_search_term_review_cache_miss", metadata);
  const review = await reviewGoogleAdsSearchTermsWithAi({ businessId: business.id, googleCustomerId: campaign.google_ads_customer_id, snapshot, snapshotHash });
  if (!review) throw new Error("Search-term recommendations are temporarily unavailable.");
  await writeGoogleAdsAuditLog({ businessId: business.id, campaignId: campaign.id, actorUserId: user.id, eventType: "google_ads_search_term_review_generated", metadata: { reviewVersion: 1, snapshotHash, generatedAt: snapshot.generatedAt, dateFrom, dateTo: to, model: metadata.model, review, terms: terms.map((term) => ({ ...term, adGroupId: term.adGroupId })).slice(0, 250), negatives: snapshot.currentNegativeKeywords } });
 } catch (error) { redirect(path(slug, "error", error instanceof Error ? error.message : "Search-term review could not be completed.")); }
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Search-term review refreshed from current Google Ads data."));
}

export async function applyGoogleAdsSearchTermNegativeKeywordsAction(slug: string, campaignId: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const terms = [...new Set(formData.getAll("terms").map(String).map((term) => term.trim()).filter(Boolean))].slice(0, 25);
 const matchType = (["EXACT", "PHRASE", "BROAD"] as const).includes(text(formData, "matchType") as any) ? text(formData, "matchType") as "EXACT" | "PHRASE" | "BROAD" : "PHRASE";
 if (text(formData, "confirmNegativeKeywords") !== "apply" || !terms.length) redirect(path(slug, "error", "Review the negative keyword changes and confirm before applying them."));
 const connection = await loadTenantGoogleAdsAccess(business.id);
 const { data: campaign } = await supabase.from("business_google_ads_campaigns").select("google_ads_customer_id,google_campaign_id,google_ad_group_id,negative_keywords").eq("business_id", business.id).eq("id", campaignId).maybeSingle();
 if (!connection?.accessToken || !campaign?.google_ads_customer_id || !campaign.google_campaign_id || !campaign.google_ad_group_id) redirect(path(slug, "error", "This campaign is not ready for negative keyword updates."));
 const access = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 const { data: reviews } = await supabase.from("business_google_ads_audit_log").select("metadata").eq("business_id", business.id).eq("campaign_id", campaignId).eq("event_type", "google_ads_search_term_review_generated").order("created_at", { ascending: false }).limit(1);
 const reviewTerms = ((reviews?.[0]?.metadata as any)?.review?.terms ?? []) as Array<{ searchTerm?: string; classification?: string; canApplyInServonas?: boolean }>;
 const allowed = new Set(reviewTerms.filter((term) => term.classification === "CONSIDER_EXCLUDING" && term.canApplyInServonas).map((term) => normalizeGoogleAdsNegativeKeyword(String(term.searchTerm ?? ""))));
 if (terms.some((term) => !allowed.has(normalizeGoogleAdsNegativeKeyword(term)))) redirect(path(slug, "error", "Only current Servonas exclusion recommendations can be applied."));
 try {
  logGoogleAdsAction("google_ads_negative_keyword_add_started", { businessId: business.id, campaignId, termCount: terms.length });
  const existing = await fetchGoogleAdsAdGroupNegativeKeywords({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id });
  const existingTerms = new Set(existing.map((item) => normalizeGoogleAdsNegativeKeyword(item.text)));
  const pending = terms.filter((term) => !existingTerms.has(normalizeGoogleAdsNegativeKeyword(term)));
  if (!pending.length) redirect(path(slug, "success", "Those search terms are already excluded."));
  const results = await Promise.all(pending.map((keyword) => appendGoogleAdsNegativeKeyword({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, adGroupId: campaign.google_ad_group_id, keyword, matchType, loginCustomerIds: access.loginCustomerIds })));
  const verified = await fetchGoogleAdsAdGroupNegativeKeywords({ accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id });
  const verifiedTerms = new Set(verified.map((item) => normalizeGoogleAdsNegativeKeyword(item.text)));
  if (pending.some((term) => !verifiedTerms.has(normalizeGoogleAdsNegativeKeyword(term)))) throw new Error("Google Ads did not verify every new negative keyword.");
  await supabase.from("business_google_ads_campaigns").update({ negative_keywords: [...new Set([...(Array.isArray(campaign.negative_keywords) ? campaign.negative_keywords.map(String) : []), ...pending])], last_sync_at: new Date().toISOString(), updated_by: user.id, updated_at: new Date().toISOString() }).eq("business_id", business.id).eq("id", campaignId);
  await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_negative_keywords_added", metadata: { googleCustomerId: campaign.google_ads_customer_id, googleCampaignId: campaign.google_campaign_id, terms: pending, matchType, recommendationSource: "servonas_ai_search_term_review", googleMutationResults: results } });
  logGoogleAdsAction("google_ads_negative_keyword_verified", { businessId: business.id, campaignId, termCount: pending.length });
 } catch (error) {
  logGoogleAdsActionError("google_ads_negative_keyword_add_failed", { businessId: business.id, campaignId, errorType: error instanceof Error ? error.name : "unknown" });
  await writeGoogleAdsAuditLog({ businessId: business.id, campaignId, actorUserId: user.id, eventType: "google_ads_negative_keywords_add_failed", metadata: { terms, matchType, recommendationSource: "servonas_ai_search_term_review", errorType: error instanceof Error ? error.name : "unknown" } });
  redirect(path(slug, "error", "Google Ads could not add those negative keywords. No change was recorded as applied."));
 }
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Negative keyword added and verified in Google Ads."));
}

export async function refreshGoogleAdsCampaignsAction(slug: string, formData: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Connect Google Ads first."));
 const dateFrom = text(formData, "from");
 const dateTo = text(formData, "to");
 if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) redirect(path(slug, "error", "Choose a valid reporting date range."));
 const metrics = await fetchGoogleAdsCampaignMetrics({ accessToken: connection.accessToken, customerId: connection.customerId, dateFrom, dateTo, businessId: business.id });
 const byCampaignId = new Map(metrics.map((row) => [row.campaignId, row]));
 const [{ data: campaigns }, { data: territories }, { data: priorReviews }] = await Promise.all([
  supabase.from("business_google_ads_campaigns").select("id,campaign_name,google_campaign_id,google_ads_customer_id,daily_budget_micros,status").eq("business_id", business.id).in("status", ["published", "paused", "archived"]),
  supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name"),
  supabase.from("business_google_ads_audit_log").select("campaign_id,metadata,created_at").eq("business_id", business.id).eq("event_type", "google_ads_keyword_review_generated").order("created_at", { ascending: false }).limit(100),
 ]);
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
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, connection.customerId);
 const staleReviewCampaignIds: string[] = [];
 await Promise.all((campaigns ?? []).filter((campaign) => campaign.google_campaign_id && campaign.google_ads_customer_id).map(async (campaign) => {
  try {
   const snapshot = await fetchGoogleAdsKeywordReviewSnapshot({
    accessToken: connection.accessToken,
    customerId: campaign.google_ads_customer_id,
    campaignId: campaign.google_campaign_id,
    campaignName: campaign.campaign_name ?? null,
    dailyBudgetMicros: campaign.daily_budget_micros ?? null,
    industry: business.industry_profile ?? null,
    locations: (territories ?? []).map((territory) => territory.name),
    dateFrom,
    dateTo,
    loginCustomerId: mutationAccess.resolvedLoginCustomerId,
    businessId: business.id,
   });
   const snapshotHash = googleAdsKeywordReviewSnapshotHash(snapshot);
   const priorReview = (priorReviews ?? []).find((entry) => entry.campaign_id === campaign.id && entry.metadata && typeof entry.metadata === "object" && typeof (entry.metadata as { snapshotHash?: unknown }).snapshotHash === "string");
   const priorSnapshotHash = priorReview && (priorReview.metadata as { snapshotHash: string }).snapshotHash;
   if (!priorSnapshotHash || priorSnapshotHash === snapshotHash) return;
   staleReviewCampaignIds.push(campaign.id);
   await writeGoogleAdsAuditLog({ businessId: business.id, campaignId: campaign.id, actorUserId: user.id, eventType: "google_ads_keyword_review_stale", metadata: { previousSnapshotHash: priorSnapshotHash, snapshotHash, snapshotTimestamp: snapshot.generatedAt, reason: "metrics_refresh_changed_ai_input" } });
  } catch (error) {
   logGoogleAdsActionError("Google Ads keyword review freshness check failed", { stage: "google_ads_keyword_review_refresh_freshness", provider: "google_ads_api", businessId: business.id, campaignId: campaign.id, errorType: error instanceof Error ? error.name : "unknown" });
  }
 }));
 const refreshedAt = new Date().toISOString();
 const totals = metrics.reduce((sum, metric) => ({ impressions: sum.impressions + metric.impressions, clicks: sum.clicks + metric.clicks, conversions: sum.conversions + metric.conversions, costMicros: sum.costMicros + metric.costMicros }), { impressions: 0, clicks: 0, conversions: 0, costMicros: 0 });
 await writeGoogleAdsAuditLog({ businessId: business.id, actorUserId: user.id, eventType: "google_ads_metrics_refreshed", metadata: { dateFrom, dateTo, refreshedAt, campaignCount: metrics.length, totals, staleReviewCampaignCount: staleReviewCampaignIds.length } });
 await checkGoogleAdsBusinessIssues({ businessId: business.id, businessSlug: slug, force: true, freshnessMinutes: 0 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(metricsPath(slug, dateFrom, dateTo, `Live Google Ads metrics refreshed at ${new Date(refreshedAt).toLocaleTimeString()}.`));
}

export async function checkGoogleAdsStatusAction(slug: string) {
 const { business } = await context(slug);
 await checkGoogleAdsBusinessIssues({ businessId: business.id, businessSlug: slug, force: true, freshnessMinutes: 0 });
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 revalidatePath(`/app/${slug}/notifications`);
 redirect(path(slug, "success", "Google Ads account status refreshed."));
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

export async function reviewGoogleAdsKeywordsAction(slug: string, campaignId: string, formData?: FormData) {
 const { supabase, business, user } = await context(slug);
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) redirect(path(slug, "error", "Reconnect Google Ads before reviewing keywords."));
 if (!process.env.OPENAI_API_KEY?.trim()) redirect(path(slug, "error", "AI keyword review is not configured."));
 const [{ data: campaign }, { data: territories }] = await Promise.all([
  supabase.from("business_google_ads_campaigns").select("id,campaign_name,google_campaign_id,google_ads_customer_id,daily_budget_micros").eq("business_id", business.id).eq("id", campaignId).maybeSingle(),
  supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name"),
 ]);
 if (!campaign?.google_campaign_id || !campaign.google_ads_customer_id) redirect(path(slug, "error", "The published campaign could not be found."));
 const access = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 const to = new Date().toISOString().slice(0, 10);
 const fromDate = new Date(`${to}T00:00:00.000Z`);
 fromDate.setUTCDate(fromDate.getUTCDate() - 29);
 try {
  const snapshot = await fetchGoogleAdsKeywordReviewSnapshot({
   accessToken: connection.accessToken, customerId: campaign.google_ads_customer_id, campaignId: campaign.google_campaign_id,
   campaignName: campaign.campaign_name ?? null, dailyBudgetMicros: campaign.daily_budget_micros ?? null,
   industry: business.industry_profile ?? null, locations: (territories ?? []).map((territory: { name: string }) => territory.name),
   dateFrom: fromDate.toISOString().slice(0, 10), dateTo: to, loginCustomerId: access.resolvedLoginCustomerId, businessId: business.id,
  });
  const snapshotHash = googleAdsKeywordReviewSnapshotHash(snapshot);
  const reviewMetadata = {
   businessId: business.id,
   googleCustomerId: campaign.google_ads_customer_id,
   googleCampaignId: snapshot.campaign.id,
   snapshotHash,
   snapshotTimestamp: snapshot.generatedAt,
   keywordCount: snapshot.keywords.length,
   enabledKeywordCount: snapshot.keywords.filter((keyword) => keyword.status === "ENABLED").length,
   positiveKeywordCount: snapshot.keywords.filter((keyword) => !keyword.negative).length,
   negativeKeywordCount: snapshot.keywords.filter((keyword) => keyword.negative).length,
   limitedKeywordCount: snapshot.keywords.filter((keyword) => keyword.primaryStatus === "LIMITED").length,
   searchTermCount: snapshot.searchTerms.items.length,
   conversionGoalCount: snapshot.campaign.conversionGoals.length,
   biddingStrategy: snapshot.campaign.biddingStrategy,
   dailyBudgetMicros: snapshot.campaign.dailyBudgetMicros,
   defaultMaxBidMicros: snapshot.campaign.adGroupDefaultCpcMicros.length ? snapshot.campaign.adGroupDefaultCpcMicros : null,
   campaignImpressions: snapshot.campaign.impressions,
   campaignClicks: snapshot.campaign.clicks,
   campaignConversions: snapshot.campaign.conversions,
   campaignCostMicros: snapshot.campaign.costMicros,
   earlyCampaignMode: snapshot.performanceDataState === "early",
   model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
  };
  logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_requested", reviewMetadata);
  const { data: priorReviews } = await supabase.from("business_google_ads_audit_log").select("metadata,created_at").eq("business_id", business.id).eq("campaign_id", campaign.id).eq("event_type", "google_ads_keyword_review_generated").order("created_at", { ascending: false }).limit(20);
  const forceReview = formData?.get("force") === "true";
  logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_cache_checked", { ...reviewMetadata, cacheStatus: forceReview ? "forced_refresh" : null });
  const cachedReview = forceReview ? null : (priorReviews ?? []).find((entry) => entry.metadata && typeof entry.metadata === "object" && (entry.metadata as { snapshotHash?: unknown }).snapshotHash === snapshotHash);
  if (cachedReview) {
   logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_cache_hit", { ...reviewMetadata, cacheStatus: "hit" });
   redirect(path(slug, "success", "Servonas reused the current AI keyword review."));
  }
  logGoogleAdsKeywordReviewStage("google_ads_ai_keyword_review_cache_miss", { ...reviewMetadata, cacheStatus: forceReview ? "forced_refresh" : "miss" });
  const review = await reviewGoogleAdsKeywordsWithAi({ businessId: business.id, googleCustomerId: campaign.google_ads_customer_id, snapshot, snapshotHash });
  if (!review) throw new Error("AI keyword recommendations are temporarily unavailable.");
  await writeGoogleAdsAuditLog({ businessId: business.id, campaignId: campaign.id, actorUserId: user.id, eventType: "google_ads_keyword_review_generated", metadata: { reviewVersion: 5, snapshotHash, generatedAt: snapshot.generatedAt, campaignGoogleId: snapshot.campaign.id, dateFrom: snapshot.dateFrom, dateTo: snapshot.dateTo, model: reviewMetadata.model, keywordCount: snapshot.keywords.length, keywordLabels: snapshot.keywords.map((keyword) => ({ id: keyword.id, text: keyword.text })).slice(0, 100), keywordDisplays: snapshot.keywords.map((keyword) => ({ id: keyword.id, text: keyword.text, matchType: keyword.matchType, status: keyword.status, primaryStatus: keyword.primaryStatus, primaryStatusReasons: keyword.primaryStatusReasons, negative: keyword.negative, cpcBidMicros: keyword.cpcBidMicros, impressions: keyword.impressions, clicks: keyword.clicks, conversions: keyword.conversions, adGroupId: keyword.adGroupId })).slice(0, 100), bidRecommendations: deriveGoogleAdsKeywordBidRecommendations(snapshot), bidActionContext: { biddingStrategy: snapshot.campaign.biddingStrategy, dailyBudgetMicros: snapshot.campaign.dailyBudgetMicros, defaultBidMicros: snapshot.campaign.adGroupDefaultCpcMicros.at(0) ?? null, suggestedDefaultBidMicros: snapshot.campaign.adGroupDefaultCpcMicros.at(0) ? googleAdsSuggestedStartingBidMicros(snapshot.campaign.adGroupDefaultCpcMicros[0]!) : null, keywordCandidates: snapshot.keywords.filter((keyword) => !keyword.negative && keyword.status === "ENABLED" && keyword.adGroupId && keyword.cpcBidMicros).map((keyword) => ({ keywordId: keyword.id, keyword: keyword.text, adGroupId: keyword.adGroupId, currentBidMicros: keyword.cpcBidMicros, suggestedBidMicros: googleAdsSuggestedStartingBidMicros(keyword.cpcBidMicros!), status: keyword.primaryStatus, reasons: keyword.primaryStatusReasons })).slice(0, 100) }, review } });
 } catch (error) {
  redirect(path(slug, "error", error instanceof Error ? error.message : "Keyword review could not be completed."));
 }
 revalidatePath(`/app/${slug}/marketing/google-ads`);
 redirect(path(slug, "success", "Keyword review refreshed from current Google Ads data."));
}
