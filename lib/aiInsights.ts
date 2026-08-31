import { createHash } from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { stripePaymentsReady } from "./stripeConnect";
import type { MarketingSourceSummary } from "./marketingAttribution";

export type AiInsightPriority = "high" | "medium" | "low" | "positive";
export type AiInsightSource = "setup" | "website" | "booking" | "google_ads" | "crm" | "financial";
export type AiInsightConfidence = "high" | "medium";

export type AiInsight = {
  id: string;
  type: string;
  title: string;
  simpleSummary: string;
  whyItMatters: string;
  recommendedAction: string;
  actionLabel: string;
  actionHref: string;
  priority: AiInsightPriority;
  source: AiInsightSource;
  confidence: AiInsightConfidence;
  evidence: Record<string, unknown>;
  educationalExplanation?: string;
  ruleVersion: number;
  aiGenerated: boolean;
};

type GoogleCampaignSnapshot = {
  status: string | null;
  primaryStatus: string | null;
  primaryStatusReasons: string[];
  impressions: number;
  clicks: number;
  ctr: number | null;
  averageCpcMicros: number | null;
  conversions: number;
};

export type AiInsightEngineInput = {
  businessId: string;
  businessSlug: string;
  industryProfile: string | null;
  businessName: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  timezone: string | null;
  website: {
    status: string | null;
    customDomain: string | null;
    publicSlug: string | null;
    requestServiceEnabled: boolean;
    bookingEnabled: boolean;
  };
  booking: {
    enabled: boolean;
    publicSlug: string | null;
  };
  payments: {
    onboardingStatus: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  } | null;
  googleAds: {
    connected: boolean;
    campaignCount: number;
    campaigns: GoogleCampaignSnapshot[];
  };
  funnel: {
    visits: number;
    engaged: number;
    bookingStarts: number;
    checkoutStarts: number;
    leads: number;
    bookings: number;
    revenueCents: number;
    periodLabel: string;
    previousVisits: number;
    previousBookingStarts: number;
    previousBookings: number;
  };
  websiteLeads: {
    newCount: number;
    oldestNewCreatedAt: string | null;
  };
  estimates: {
    awaitingResponseCount: number;
    oldestAwaitingResponseAt: string | null;
  };
  invoices: {
    overdueCount: number;
    overdueAmountCents: number;
  };
};

type CachedAiInsightRow = {
  business_id: string;
  scope: string;
  input_hash: string;
  insights: AiInsight[];
  generated_at: string;
  rule_version: number;
  used_llm: boolean;
  diagnostics: Record<string, unknown>;
};

const ruleVersion = 1;
const scope = "marketing_funnel";

function priorityScore(priority: AiInsightPriority) {
  switch (priority) {
    case "high":
      return 400;
    case "medium":
      return 300;
    case "low":
      return 200;
    case "positive":
      return 100;
  }
}

function confidenceScore(confidence: AiInsightConfidence) {
  return confidence === "high" ? 40 : 20;
}

function actionabilityScore(priority: AiInsightPriority) {
  return priority === "positive" ? 0 : priority === "high" ? 50 : priority === "medium" ? 35 : 20;
}

function createInsight(input: Omit<AiInsight, "ruleVersion" | "aiGenerated">) {
  return {
    ...input,
    ruleVersion,
    aiGenerated: false,
  } satisfies AiInsight;
}

function stringifyEvidence(value: Record<string, unknown>) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function cacheHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildAiInsightsCacheSummary(input: AiInsightEngineInput) {
  return {
    businessId: input.businessId,
    website: input.website,
    booking: input.booking,
    payments: input.payments,
    googleAds: input.googleAds,
    funnel: input.funnel,
    websiteLeads: input.websiteLeads,
    estimates: input.estimates,
    invoices: input.invoices,
    ruleVersion,
  };
}

function ageInHours(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / 3_600_000);
}

function buildDeterministicInsights(input: AiInsightEngineInput) {
  const insights: AiInsight[] = [];
  const setupMissing = [
    !input.businessName ? "business name" : null,
    !input.businessEmail ? "business email" : null,
    !input.businessPhone ? "business phone" : null,
    !input.addressLine1 ? "street address" : null,
    !input.city ? "city" : null,
    !input.state ? "state" : null,
    !input.timezone ? "time zone" : null,
  ].filter(Boolean) as string[];
  if (setupMissing.length) {
    insights.push(createInsight({
      id: "setup_incomplete",
      type: "setup_incomplete",
      title: "Finish your business setup",
      simpleSummary: `A few core business details are still missing: ${setupMissing.join(", ")}.`,
      whyItMatters: "Servonas uses your business details to power website pages, booking flows, invoices, and local marketing setup.",
      recommendedAction: "Finish the missing business details first so everything else has the right information.",
      actionLabel: "Finish setup",
      actionHref: `/app/${input.businessSlug}/settings`,
      priority: "high",
      source: "setup",
      confidence: "high",
      evidence: { missingFields: setupMissing },
    }));
  }

  const websitePublished = input.website.status === "published" || Boolean(input.website.customDomain || input.website.publicSlug);
  if (!websitePublished) {
    insights.push(createInsight({
      id: "website_not_published",
      type: "website_not_published",
      title: "Publish your website",
      simpleSummary: "Your website is not live yet, so customers cannot reliably find or use it.",
      whyItMatters: "A live website gives ads, search traffic, and direct visitors somewhere to land and convert into leads or bookings.",
      recommendedAction: "Finish the website setup and publish it before pushing more marketing traffic.",
      actionLabel: "Review website",
      actionHref: `/app/${input.businessSlug}/settings/website`,
      priority: "high",
      source: "website",
      confidence: "high",
      evidence: { websiteStatus: input.website.status, hasCustomDomain: Boolean(input.website.customDomain), hasPublicSlug: Boolean(input.website.publicSlug) },
    }));
  } else if (input.booking.enabled) {
    insights.push(createInsight({
      id: "website_ready",
      type: "website_ready",
      title: "Your website is ready for customers",
      simpleSummary: "Your website is live and online booking is available.",
      whyItMatters: "This means visitors can move from interest to an actual booking without waiting for manual follow-up.",
      recommendedAction: "Keep sending traffic here and watch which pages and dates customers respond to most.",
      actionLabel: "View website",
      actionHref: `/app/${input.businessSlug}/settings/website`,
      priority: "positive",
      source: "website",
      confidence: "high",
      evidence: { websiteStatus: input.website.status, bookingEnabled: input.booking.enabled },
    }));
  }

  if (!input.booking.enabled) {
    insights.push(createInsight({
      id: "online_booking_not_enabled",
      type: "online_booking_not_enabled",
      title: "Turn on online booking",
      simpleSummary: "Customers can view your business, but they cannot complete an online booking yet.",
      whyItMatters: "Online booking removes friction. Fewer handoffs usually means more completed bookings.",
      recommendedAction: "Enable booking once your availability, services, and booking settings are ready.",
      actionLabel: "Enable booking",
      actionHref: `/app/${input.businessSlug}/booking`,
      priority: "high",
      source: "booking",
      confidence: "high",
      evidence: { bookingEnabled: input.booking.enabled, bookingPublicSlug: input.booking.publicSlug },
    }));
  }

  const paymentsReady = stripePaymentsReady({
    onboarding_status: input.payments?.onboardingStatus ?? null,
    charges_enabled: input.payments?.chargesEnabled ?? false,
    payouts_enabled: input.payments?.payoutsEnabled ?? false,
  });
  if (input.booking.enabled && !paymentsReady) {
    insights.push(createInsight({
      id: "payments_not_configured",
      type: "payments_not_configured",
      title: "Finish payment setup",
      simpleSummary: "Your booking flow is on, but payments are not fully configured yet.",
      whyItMatters: "If customers cannot pay or place a deposit when needed, more of them may drop off before finishing.",
      recommendedAction: "Complete Stripe setup so your booking and invoice payment flow is ready.",
      actionLabel: "Connect payments",
      actionHref: `/app/${input.businessSlug}/settings`,
      priority: "medium",
      source: "financial",
      confidence: "high",
      evidence: {
        onboardingStatus: input.payments?.onboardingStatus ?? null,
        chargesEnabled: input.payments?.chargesEnabled ?? false,
        payoutsEnabled: input.payments?.payoutsEnabled ?? false,
      },
    }));
  }

  if (!input.googleAds.connected && input.googleAds.campaignCount === 0) {
    insights.push(createInsight({
      id: "google_ads_not_started",
      type: "google_ads_not_started",
      title: "Google Ads has not been started yet",
      simpleSummary: "You do not have a connected Google Ads campaign for this business yet.",
      whyItMatters: "Google Ads can help new customers discover you, but only after the connection and first campaign are in place.",
      recommendedAction: "Connect Google Ads when your website and booking flow are ready for new traffic.",
      actionLabel: "View Google Ads",
      actionHref: `/app/${input.businessSlug}/marketing/google-ads`,
      priority: websitePublished ? "medium" : "low",
      source: "google_ads",
      confidence: "high",
      evidence: { connected: input.googleAds.connected, campaignCount: input.googleAds.campaignCount },
      educationalExplanation: "Google Ads is paid traffic. You set a daily budget, and Google can show your business when people search for related services.",
    }));
  }

  const pausedCampaign = input.googleAds.campaigns.find((campaign) => campaign.status === "PAUSED");
  if (pausedCampaign) {
    insights.push(createInsight({
      id: "google_ads_campaign_paused",
      type: "google_ads_campaign_paused",
      title: "Your Google Ads campaign is paused",
      simpleSummary: "The campaign exists, but Google is not showing it because it is paused.",
      whyItMatters: "A paused campaign will not bring in ad traffic until you turn it back on.",
      recommendedAction: "Resume the campaign when you are ready to receive more traffic.",
      actionLabel: "View Google Ads",
      actionHref: `/app/${input.businessSlug}/marketing/google-ads`,
      priority: "medium",
      source: "google_ads",
      confidence: "high",
      evidence: { status: pausedCampaign.status, primaryStatus: pausedCampaign.primaryStatus },
      educationalExplanation: "Paused simply means the campaign is turned off on purpose. It is not a Google policy problem.",
    }));
  }

  const underReviewCampaign = input.googleAds.campaigns.find((campaign) => campaign.status === "ENABLED" && (campaign.primaryStatus === "PENDING" || campaign.primaryStatusReasons.includes("MOST_ADS_UNDER_REVIEW")));
  if (underReviewCampaign) {
    insights.push(createInsight({
      id: "google_ads_under_review",
      type: "google_ads_under_review",
      title: "Google is still reviewing your ads",
      simpleSummary: "Your campaign is turned on, but Google has not finished approving the ads yet.",
      whyItMatters: "Your ads usually will not start showing until Google finishes the review.",
      recommendedAction: "You do not need to change anything right now. Check back after Google finishes the review.",
      actionLabel: "View Google Ads",
      actionHref: `/app/${input.businessSlug}/marketing/google-ads`,
      priority: "medium",
      source: "google_ads",
      confidence: "high",
      evidence: { status: underReviewCampaign.status, servingStatus: underReviewCampaign.primaryStatus, reasons: underReviewCampaign.primaryStatusReasons },
      educationalExplanation: "This is normal for a new campaign. Google reviews ads before they can start serving.",
    }));
  }

  const activeNoImpressionsCampaign = input.googleAds.campaigns.find((campaign) => campaign.status === "ENABLED" && !campaign.impressions && campaign.primaryStatus !== "PENDING");
  if (activeNoImpressionsCampaign) {
    insights.push(createInsight({
      id: "google_ads_active_no_impressions",
      type: "google_ads_active_no_impressions",
      title: "Your Google Ads campaign is on, but nobody has seen it yet",
      simpleSummary: "Google has not recorded any ad impressions for this campaign yet.",
      whyItMatters: "An impression means your ad was shown to someone. If impressions stay at zero, the campaign cannot create clicks or leads.",
      recommendedAction: "Give the campaign a little time first. If impressions stay at zero, review your campaign settings in Google Ads.",
      actionLabel: "View Google Ads",
      actionHref: `/app/${input.businessSlug}/marketing/google-ads`,
      priority: "low",
      source: "google_ads",
      confidence: "medium",
      evidence: { impressions: activeNoImpressionsCampaign.impressions, status: activeNoImpressionsCampaign.status, primaryStatus: activeNoImpressionsCampaign.primaryStatus },
      educationalExplanation: "An impression means Google displayed your ad. No impressions means the ad has not started reaching searchers yet.",
    }));
  }

  const lowCtrCampaign = input.googleAds.campaigns.find((campaign) => campaign.impressions >= 100 && campaign.ctr != null && campaign.ctr < 0.01);
  if (lowCtrCampaign) {
    insights.push(createInsight({
      id: "google_ads_low_ctr",
      type: "google_ads_low_ctr",
      title: "People are seeing your ad, but few are clicking it",
      simpleSummary: `Your ad was shown ${lowCtrCampaign.impressions} times and received ${lowCtrCampaign.clicks} clicks.`,
      whyItMatters: "Google calls this your click-through rate, or CTR. A low CTR can mean the ad copy or search match is not grabbing enough attention.",
      recommendedAction: "Let the data build a little more, then review your keywords and ad wording if this stays low.",
      actionLabel: "View Google Ads",
      actionHref: `/app/${input.businessSlug}/marketing/google-ads`,
      priority: "medium",
      source: "google_ads",
      confidence: "high",
      evidence: { impressions: lowCtrCampaign.impressions, clicks: lowCtrCampaign.clicks, ctr: lowCtrCampaign.ctr },
      educationalExplanation: "CTR stands for click-through rate. It means the share of people who clicked after seeing the ad.",
    }));
  }

  const highCpcCampaign = input.googleAds.campaigns.find((campaign) => campaign.clicks >= 5 && (campaign.averageCpcMicros ?? 0) >= 8_000_000);
  if (highCpcCampaign) {
    insights.push(createInsight({
      id: "google_ads_high_cpc",
      type: "google_ads_high_cpc",
      title: "Your ad clicks are getting expensive",
      simpleSummary: `Google is charging about $${((highCpcCampaign.averageCpcMicros ?? 0) / 1_000_000).toFixed(2)} each time someone clicks your ad.`,
      whyItMatters: "This is called cost per click. A higher cost per click is not automatically bad, but it matters more if those clicks are not turning into leads or bookings.",
      recommendedAction: "Watch whether these clicks turn into real leads before increasing budget.",
      actionLabel: "View Google Ads",
      actionHref: `/app/${input.businessSlug}/marketing/google-ads`,
      priority: "low",
      source: "google_ads",
      confidence: "medium",
      evidence: { averageCpcMicros: highCpcCampaign.averageCpcMicros, clicks: highCpcCampaign.clicks, conversions: highCpcCampaign.conversions },
      educationalExplanation: "Cost per click means how much Google charges when someone clicks the ad.",
    }));
  }

  const clicksNoConversionsCampaign = input.googleAds.campaigns.find((campaign) => campaign.clicks >= 10 && campaign.conversions === 0);
  if (clicksNoConversionsCampaign) {
    insights.push(createInsight({
      id: "google_ads_clicks_no_conversions",
      type: "google_ads_clicks_no_conversions",
      title: "People are clicking the ad, but not turning into leads yet",
      simpleSummary: `Your campaign has ${clicksNoConversionsCampaign.clicks} clicks and no recorded conversions so far.`,
      whyItMatters: "A conversion is the action you want, like a lead or booking. Clicks without conversions can mean the landing page or booking flow still has friction.",
      recommendedAction: "Check the website and booking flow before making bigger ad changes.",
      actionLabel: "Review website",
      actionHref: `/app/${input.businessSlug}/settings/website`,
      priority: "medium",
      source: "google_ads",
      confidence: "high",
      evidence: { clicks: clicksNoConversionsCampaign.clicks, conversions: clicksNoConversionsCampaign.conversions },
      educationalExplanation: "A conversion is the useful action you care about, such as someone becoming a lead or completing a booking.",
    }));
  }

  const impressionsNoClicksCampaign = input.googleAds.campaigns.find((campaign) => campaign.impressions >= 100 && campaign.clicks === 0);
  if (impressionsNoClicksCampaign) {
    insights.push(createInsight({
      id: "google_ads_impressions_no_clicks",
      type: "google_ads_impressions_no_clicks",
      title: "People are seeing the ad, but nobody has clicked yet",
      simpleSummary: `Your ad has ${impressionsNoClicksCampaign.impressions} impressions and 0 clicks.`,
      whyItMatters: "That usually means the ad is reaching people, but the message is not convincing them to visit your website.",
      recommendedAction: "Keep watching until there is a larger sample, then adjust ad copy if this does not improve.",
      actionLabel: "View Google Ads",
      actionHref: `/app/${input.businessSlug}/marketing/google-ads`,
      priority: "medium",
      source: "google_ads",
      confidence: "high",
      evidence: { impressions: impressionsNoClicksCampaign.impressions, clicks: impressionsNoClicksCampaign.clicks },
      educationalExplanation: "An impression means the ad was shown. A click means someone cared enough to visit your site.",
    }));
  }

  if (input.funnel.visits >= 50 && input.funnel.bookingStarts === 0) {
    insights.push(createInsight({
      id: "traffic_no_booking_interest",
      type: "traffic_no_booking_interest",
      title: "People are visiting, but not starting a booking",
      simpleSummary: `You had ${input.funnel.visits} visits in ${input.funnel.periodLabel}, but no booking starts.`,
      whyItMatters: "Traffic only helps if visitors take the next step. If nobody starts a booking, something on the page may not feel clear or compelling enough.",
      recommendedAction: "Review your booking buttons, offer messaging, and first-screen website copy.",
      actionLabel: "Review website",
      actionHref: `/app/${input.businessSlug}/settings/website`,
      priority: "high",
      source: "website",
      confidence: "high",
      evidence: { visits: input.funnel.visits, bookingStarts: input.funnel.bookingStarts, periodLabel: input.funnel.periodLabel },
    }));
  }

  if ((input.funnel.bookingStarts >= 5 || input.funnel.checkoutStarts >= 5) && input.funnel.bookings === 0) {
    insights.push(createInsight({
      id: "booking_dropoff",
      type: "booking_dropoff",
      title: "Customers are starting the booking flow but not finishing",
      simpleSummary: `${input.funnel.bookingStarts} booking starts turned into ${input.funnel.bookings} completed bookings in ${input.funnel.periodLabel}.`,
      whyItMatters: "This usually means there is friction after interest begins, such as pricing questions, required fields, availability confusion, or payment hesitation.",
      recommendedAction: "Test the booking flow yourself and look for the step where customers are stopping.",
      actionLabel: "View funnel",
      actionHref: `/app/${input.businessSlug}/marketing/funnel`,
      priority: "high",
      source: "booking",
      confidence: "high",
      evidence: { bookingStarts: input.funnel.bookingStarts, checkoutStarts: input.funnel.checkoutStarts, bookings: input.funnel.bookings, periodLabel: input.funnel.periodLabel },
    }));
  }

  if (input.funnel.visits >= 50 && input.funnel.bookingStarts >= 5 && input.funnel.bookings >= 2 && (input.funnel.previousBookings < input.funnel.bookings || input.funnel.previousBookingStarts < input.funnel.bookingStarts)) {
    insights.push(createInsight({
      id: "booking_activity_improving",
      type: "booking_activity_improving",
      title: "More visitors are moving into your booking flow",
      simpleSummary: `You have ${input.funnel.bookingStarts} booking starts and ${input.funnel.bookings} completed bookings in this period.`,
      whyItMatters: "This is a healthy sign that traffic is turning into real customer intent.",
      recommendedAction: "Keep watching which traffic sources and rental dates drive the strongest demand.",
      actionLabel: "View funnel",
      actionHref: `/app/${input.businessSlug}/marketing/funnel`,
      priority: "positive",
      source: "booking",
      confidence: "medium",
      evidence: {
        bookingStarts: input.funnel.bookingStarts,
        previousBookingStarts: input.funnel.previousBookingStarts,
        bookings: input.funnel.bookings,
        previousBookings: input.funnel.previousBookings,
      },
    }));
  }

  const newLeadAgeHours = ageInHours(input.websiteLeads.oldestNewCreatedAt);
  if (input.websiteLeads.newCount > 0 && newLeadAgeHours != null && newLeadAgeHours >= 72) {
    insights.push(createInsight({
      id: "lead_followup_overdue",
      type: "lead_followup_needed",
      title: "A website lead has gone several days without follow-up",
      simpleSummary: `${input.websiteLeads.newCount} website lead${input.websiteLeads.newCount === 1 ? " is" : "s are"} still marked new.`,
      whyItMatters: "Lead response speed matters. Waiting several days makes it much more likely the customer chooses someone else.",
      recommendedAction: "Reach out to your oldest unworked website leads and update their status.",
      actionLabel: "View leads",
      actionHref: `/app/${input.businessSlug}/settings/website`,
      priority: "high",
      source: "crm",
      confidence: "high",
      evidence: { newLeadCount: input.websiteLeads.newCount, oldestLeadAgeHours: Math.round(newLeadAgeHours) },
    }));
  } else if (input.websiteLeads.newCount > 0) {
    insights.push(createInsight({
      id: "lead_followup_needed",
      type: "lead_followup_needed",
      title: "You have a new website lead to follow up with",
      simpleSummary: `${input.websiteLeads.newCount} website lead${input.websiteLeads.newCount === 1 ? "" : "s"} still need follow-up.`,
      whyItMatters: "New leads are most valuable while the customer is still actively looking for help.",
      recommendedAction: "Follow up with the newest lead and move it to the right status after contact.",
      actionLabel: "View leads",
      actionHref: `/app/${input.businessSlug}/settings/website`,
      priority: "medium",
      source: "crm",
      confidence: "high",
      evidence: { newLeadCount: input.websiteLeads.newCount, oldestLeadAgeHours: newLeadAgeHours == null ? null : Math.round(newLeadAgeHours) },
    }));
  }

  const awaitingEstimateAgeHours = ageInHours(input.estimates.oldestAwaitingResponseAt);
  if (input.estimates.awaitingResponseCount > 0 && awaitingEstimateAgeHours != null && awaitingEstimateAgeHours >= 72) {
    insights.push(createInsight({
      id: "estimate_awaiting_response",
      type: "estimate_awaiting_response",
      title: "An estimate is still waiting on a customer response",
      simpleSummary: `${input.estimates.awaitingResponseCount} sent estimate${input.estimates.awaitingResponseCount === 1 ? " is" : "s are"} still open.`,
      whyItMatters: "Open estimates can quietly go stale if nobody follows up.",
      recommendedAction: "Review the oldest open estimate and send a follow-up if it still matters.",
      actionLabel: "View estimates",
      actionHref: `/app/${input.businessSlug}/estimates`,
      priority: "medium",
      source: "crm",
      confidence: "medium",
      evidence: { awaitingResponseCount: input.estimates.awaitingResponseCount, oldestAwaitingResponseAgeHours: Math.round(awaitingEstimateAgeHours) },
    }));
  }

  if (input.invoices.overdueCount > 0) {
    insights.push(createInsight({
      id: "invoice_overdue",
      type: "invoice_overdue",
      title: "You have overdue invoices",
      simpleSummary: `${input.invoices.overdueCount} invoice${input.invoices.overdueCount === 1 ? " is" : "s are"} overdue, totaling $${(input.invoices.overdueAmountCents / 100).toFixed(2)}.`,
      whyItMatters: "Overdue invoices can turn completed work into delayed cash flow.",
      recommendedAction: "Review the overdue invoices and follow up with those customers.",
      actionLabel: "View invoices",
      actionHref: `/app/${input.businessSlug}/invoices`,
      priority: "high",
      source: "financial",
      confidence: "high",
      evidence: { overdueCount: input.invoices.overdueCount, overdueAmountCents: input.invoices.overdueAmountCents },
    }));
  }

  if (!insights.length) {
    insights.push(createInsight({
      id: "still_learning",
      type: "still_learning",
      title: "Servonas is still learning about your business",
      simpleSummary: "Once you start getting website visitors, leads, bookings, and ad traffic, you will see more specific recommendations here.",
      whyItMatters: "Good recommendations need enough real activity to avoid overreacting to tiny sample sizes.",
      recommendedAction: "Finish setup and keep sending customers to your website so Servonas has enough signal to help.",
      actionLabel: "Review website",
      actionHref: `/app/${input.businessSlug}/settings/website`,
      priority: "low",
      source: "setup",
      confidence: "high",
      evidence: { visits: input.funnel.visits, connectedGoogleAds: input.googleAds.connected, websitePublished },
    }));
  }

  return insights;
}

export function generateAiInsights(input: AiInsightEngineInput) {
  const raw = buildDeterministicInsights(input);
  const deduped = new Map<string, AiInsight>();
  for (const insight of raw) {
    const key = `${insight.type}:${stringifyEvidence(insight.evidence)}`;
    if (!deduped.has(key)) deduped.set(key, insight);
  }
  const ranked = [...deduped.values()].sort((left, right) => {
    const scoreDelta = (priorityScore(right.priority) + confidenceScore(right.confidence) + actionabilityScore(right.priority))
      - (priorityScore(left.priority) + confidenceScore(left.confidence) + actionabilityScore(left.priority));
    if (scoreDelta !== 0) return scoreDelta;
    return left.title.localeCompare(right.title);
  });
  return {
    focus: ranked.slice(0, 3),
    more: ranked.slice(3),
    all: ranked,
    usedLlm: false,
  };
}

export async function loadCachedAiInsights(businessId: string, inputHash: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("business_ai_insight_snapshots")
    .select("business_id,scope,input_hash,insights,generated_at,rule_version,used_llm,diagnostics")
    .eq("business_id", businessId)
    .eq("scope", scope)
    .eq("input_hash", inputHash)
    .maybeSingle();
  if (error) {
    console.error("AI insights cache load failed", {
      businessId,
      scope,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return (data ?? null) as CachedAiInsightRow | null;
}

export async function saveCachedAiInsights(businessId: string, inputHash: string, insights: AiInsight[], diagnostics: Record<string, unknown>) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin
    .from("business_ai_insight_snapshots")
    .upsert({
      business_id: businessId,
      scope,
      input_hash: inputHash,
      insights,
      generated_at: new Date().toISOString(),
      rule_version: ruleVersion,
      used_llm: false,
      diagnostics,
    }, { onConflict: "business_id,scope" });
  if (error) {
    console.error("AI insights cache write failed", {
      businessId,
      scope,
      code: error.code,
      message: error.message,
    });
  }
}

export async function resolveAiInsights(input: AiInsightEngineInput) {
  const summary = buildAiInsightsCacheSummary(input);
  const inputHash = cacheHash(summary);
  const cached = await loadCachedAiInsights(input.businessId, inputHash);
  if (cached?.insights?.length) {
    return {
      ...generateAiInsights(input),
      all: cached.insights,
      focus: cached.insights.slice(0, 3),
      more: cached.insights.slice(3),
      cache: {
        hit: true,
        generatedAt: cached.generated_at,
        inputHash,
      },
      usedLlm: false,
    };
  }
  const generated = generateAiInsights(input);
  await saveCachedAiInsights(input.businessId, inputHash, generated.all, {
    businessId: input.businessId,
    scope,
    insightCount: generated.all.length,
    inputSummary: summary,
    containsPii: false,
  });
  return {
    ...generated,
    cache: {
      hit: false,
      generatedAt: new Date().toISOString(),
      inputHash,
    },
  };
}

export function buildPreviousPeriodReport(summaries: MarketingSourceSummary[]) {
  return summaries.reduce((totals, row) => {
    totals.visits += row.visits;
    totals.bookingStarts += row.detailedCounts.booking_cta_click ?? 0;
    totals.bookings += row.detailedCounts.booking_completed ?? 0;
    return totals;
  }, { visits: 0, bookingStarts: 0, bookings: 0 });
}
