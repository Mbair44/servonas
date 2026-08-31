import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import {
 fetchGoogleAdsCampaignStatuses,
 fetchGoogleAdsCampaignMetrics,
 fetchGoogleAdsSearchTerms,
 googleAdsReadyLabel,
 loadTenantGoogleAdsAccess,
 recordGoogleAdsBetaEvent,
 runGoogleAdsPermissionDiagnostic,
 type GoogleAdsCustomer,
} from "@/lib/googleAdsManagement";
import {
 addGoogleAdsNegativeKeywordAction,
 createGoogleAdsDraftAction,
 disconnectGoogleAds,
 markGoogleAdsBillingReadyAction,
 publishGoogleAdsDraftAction,
 refreshGoogleAdsAccountsAction,
 refreshGoogleAdsCampaignsAction,
 runGoogleAdsPermissionDiagnosticAction,
 selectGoogleAdsCustomer,
 setGoogleAdsCampaignStatusAction,
 submitGoogleAdsBetaFeedbackAction,
 updateGoogleAdsBudgetAction,
 updateGoogleAdsDraftAction,
} from "./actions";
import { GoogleAdsDraftSubmit } from "@/components/GoogleAdsDraftSubmit";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const microsToMoney = (micros: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(micros / 1_000_000);
const validDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const monthStart = (value: string) => `${value.slice(0, 8)}01`;

function items(value: unknown) {
 return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

const billingUrl = (customerId: string | null | undefined) =>
 customerId ? `https://ads.google.com/aw/billing/summary?ocid=${encodeURIComponent(customerId)}` : "https://ads.google.com/home/";

const accountCreateUrl = "https://ads.google.com/home/";
const industryLabel = (value: string | null | undefined) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Business";
const friendlyGoogleCampaignStatus = (status: string | null | undefined) => {
 if (status === "ENABLED") return "Published — Active";
 if (status === "PAUSED") return "Published — Paused";
 if (status === "REMOVED") return "Removed";
 return "Published";
};
const friendlyPrimaryStatus = (status: string | null | undefined) => status ? status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
const friendlyIssue = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

type CampaignCardViewModel = {
 campaign: any;
 metric: Awaited<ReturnType<typeof fetchGoogleAdsCampaignMetrics>>[number] | null;
 effectiveGoogleStatus: string | null;
 effectivePrimaryStatus: string | null;
 primaryStatusReasons: string[];
 statusSyncUnavailable: boolean;
 issuesAvailable: boolean;
 effectiveCardStatus: "published" | "paused" | "issue" | "failed" | "queued" | "removed" | string;
 statusLabel: string;
};

function buildCampaignViewModels(
 campaigns: any[] | null | undefined,
 metricsByCampaignId: Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignMetrics>>[number]>,
 campaignStatusesByCampaignId: Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignStatuses>>[number]>,
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
  } satisfies CampaignCardViewModel;
 });
}

export default async function GoogleAdsPage({
 params,
 searchParams,
}: {
 params: Promise<{ businessSlug: string }>;
 searchParams: Promise<{ from?: string; to?: string; error?: string; success?: string; diagnostic?: string }>;
}) {
 const { businessSlug } = await params;
 const query = await searchParams;
 const { supabase, business, role } = await requireWorkspace(businessSlug);
 const canEdit = canManageBusiness(role);
 const today = new Date().toISOString().slice(0, 10);
 const to = validDate(query.to) ? query.to! : today;
 const from = validDate(query.from) ? query.from! : monthStart(to);
 if (!canEdit) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can manage Google Ads.</div></section></main>;

 const [{ data: services }, { data: inventory }, { data: territories }, { data: website }, { data: connection }, { data: campaigns }, { data: auditLog }, { data: betaEvents }, { data: betaFeedback }] = await Promise.all([
  supabase.from("services").select("id,name,description").eq("business_id", business.id).eq("active", true).eq("is_deleted", false).order("sort_order").order("name"),
  supabase.from("inventory_items").select("id,name,description").eq("business_id", business.id).eq("active", true).order("sort_order").order("name"),
  supabase.from("workforce_territories").select("name").eq("business_id", business.id).eq("is_active", true).order("name"),
  supabase.from("business_website_settings").select("public_slug,custom_domain,status,domain_status,hero_heading,hero_subheading,about_text").eq("business_id", business.id).maybeSingle(),
  supabase.from("business_google_ads_connections").select("google_ads_customer_id,accessible_customer_ids,accessible_customer_labels,status,google_authenticated_email,google_authenticated_name,account_discovery_last_successful_at,account_discovery_last_attempted_at,account_discovery_retry_after_at,account_discovery_last_http_status,account_discovery_last_google_status,account_discovery_last_message,account_discovery_last_request_id").eq("business_id", business.id).maybeSingle(),
  supabase.from("business_google_ads_campaigns").select("*").eq("business_id", business.id).order("updated_at", { ascending: false }),
  supabase.from("business_google_ads_audit_log").select("event_type,metadata,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(8),
  supabase.from("business_google_ads_beta_events").select("event_name,metadata,occurred_at").eq("business_id", business.id).order("occurred_at", { ascending: false }).limit(40),
  supabase.from("business_google_ads_beta_feedback").select("rating,feedback,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(5),
 ]);

 let connectionAccess: Awaited<ReturnType<typeof loadTenantGoogleAdsAccess>> | null = null;
 let connectionError: string | null = null;
 let permissionDiagnostic: Awaited<ReturnType<typeof runGoogleAdsPermissionDiagnostic>> | null = null;
 let metricsByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignMetrics>>[number]>();
 let campaignStatusesByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignStatuses>>[number]>();
 let topSearchTerms: Awaited<ReturnType<typeof fetchGoogleAdsSearchTerms>> = [];
 if (connection?.status && connection.status !== "disconnected") {
  try {
   connectionAccess = await loadTenantGoogleAdsAccess(business.id);
   if (connectionAccess?.customerId) {
    const metrics = await fetchGoogleAdsCampaignMetrics({
     accessToken: connectionAccess.accessToken,
     customerId: connectionAccess.customerId,
     dateFrom: from,
     dateTo: to,
    });
    metricsByCampaignId = new Map(metrics.map((row) => [row.campaignId, row]));
    const publishedIds = (campaigns ?? []).map((campaign: any) => String(campaign.google_campaign_id ?? "")).filter(Boolean);
    const campaignStatuses = await fetchGoogleAdsCampaignStatuses({
     accessToken: connectionAccess.accessToken,
     customerId: connectionAccess.customerId,
     campaignIds: publishedIds,
     loginCustomerId: connectionAccess.loginCustomerId,
    });
    campaignStatusesByCampaignId = new Map(campaignStatuses.map((row) => [row.campaignId, row]));
    topSearchTerms = await fetchGoogleAdsSearchTerms({
     accessToken: connectionAccess.accessToken,
     customerId: connectionAccess.customerId,
     campaignIds: publishedIds,
     dateFrom: from,
     dateTo: to,
    });
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
 const campaignCards = buildCampaignViewModels(campaigns ?? [], metricsByCampaignId, campaignStatusesByCampaignId);
 const hasOfferOptions = Boolean((services?.length ?? 0) || (inventory?.length ?? 0));
 const hasCampaigns = campaignCards.length > 0;
 const publishedCampaigns = (campaigns ?? []).filter((campaign: any) => ["published", "paused"].includes(campaign.status));
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
   label: "Connect Google Ads",
   description: "Connect the Google login that will manage advertising for this business.",
   done: setupConnected,
  },
  {
   id: "account",
   label: "Choose Ads account",
   description: "Pick the Google Ads account this business should use.",
   done: Boolean(selectedCustomerId),
  },
  {
   id: "billing",
   label: "Confirm Google billing",
   description: "Finish billing in Google before ads go live.",
   done: billingReady,
  },
  {
   id: "build",
   label: "Build campaign",
   description: "Create a draft based on your offer, audience, and website.",
   done: hasCampaigns,
  },
  {
   id: "review",
   label: "Review & publish",
   description: "Review the draft and publish it to Google Ads.",
   done: publishedCampaigns.length > 0,
  },
  {
   id: "track",
   label: "Start & track results",
   description: "Use performance results to monitor spend and conversions.",
   done: publishedCampaigns.length > 0,
  },
 ] as const;
 const currentStepIndex = setupSteps.findIndex((step) => !step.done);
 const setupComplete = setupSteps.every((step) => step.done);
 const nextStepIndex = currentStepIndex === -1 ? setupSteps.length - 1 : currentStepIndex;
 const nextStep = setupSteps[nextStepIndex] ?? setupSteps[0];
 const compactActivity = (auditLog ?? []).slice(0, 4);

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
  <header className="marketing-analytics-header">
   <div>
    <span className="sv-kicker">Marketing</span>
    <h1>Google Ads Beta</h1>
    <p>Get more customers with Google Ads. Servonas helps build a simple Google Search campaign, choose keywords, write your ads, and track results while Google bills ad spend directly to your own account.</p>
    {business.name && <small>{business.name}</small>}
   </div>
  </header>
  <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`}>Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`} aria-current="page">Google Ads</Link></nav>
  {latestAction && <section className={`workspace-notice ${latestAction.tone} google-ads-latest-action`}><strong>{latestAction.title}</strong><span>{latestAction.message}</span></section>}
  {googleAdsReadyLabel() !== "ready" && <div className="workspace-notice error">Google Ads is not fully configured. Add `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, and `GOOGLE_ADS_DEVELOPER_TOKEN` before connecting tenants.</div>}

  <section className={`workspace-panel google-ads-guide ${setupComplete ? "is-complete" : ""}`}>
   <div className="google-ads-guide-intro">
    <div>
     <span className="sv-kicker">Included during beta</span>
     <h2>{setupComplete ? "Google Ads setup complete" : nextStep.label}</h2>
     <p>{setupComplete ? "Your connection, billing, campaign, and reporting flow are in place. Use the sections below to manage and track results." : nextStep.description}</p>
    </div>
    <div className="google-ads-beta-pricing">
     <article>
      <span>Servonas Ads Beta</span>
      <strong>$0</strong>
      <small>Included during beta. No setup fee, no monthly management fee, and no Stripe checkout.</small>
     </article>
     <article>
      <span>Google advertising budget</span>
      <strong>{campaigns?.length ? money(Number(campaigns?.[0]?.monthly_budget_estimate_cents ?? 0)) : "$500.00"}/month</strong>
      <small>Paid directly to Google from the Google Ads account you connect.</small>
     </article>
    </div>
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
   {setupComplete && <div className="google-ads-guide-complete"><strong>Everything needed to launch and monitor Google Ads is ready.</strong><div className="google-ads-readiness-mini">{setupSteps.map((step) => <span key={step.id} className="is-complete">{step.label}</span>)}</div></div>}
   <div className="google-ads-guide-actions">
    {!setupConnected && <>
     <a className="sv-button" href={`/api/google-ads/connect/${businessSlug}`}>Connect Google Ads</a>
     <a className="sv-button sv-secondary" href={accountCreateUrl} target="_blank" rel="noopener noreferrer">Create Google Ads Account</a>
    </>}
    {setupConnected && !billingReady && <>
     <a className="sv-button" href={billingUrl(selectedCustomerId)} target="_blank" rel="noopener noreferrer">Complete Billing with Google</a>
     <form action={markGoogleAdsBillingReadyAction.bind(null, businessSlug)}>
      <input type="hidden" name="customerId" value={selectedCustomerId ?? ""} />
      <button className="sv-button sv-secondary">I finished billing setup</button>
     </form>
    </>}
   </div>
   <div className="google-ads-supporting-checks">
    <article className={businessInfoReady ? "is-complete" : ""}><strong>Business info</strong><span>{businessInfoReady ? "Ready for ad drafting" : "Add email, city, or state"}</span></article>
    <article className={landingPageReady ? "is-complete" : ""}><strong>Landing page</strong><span>{landingPageReady ? "Ready for traffic" : "Publish a site or booking page"}</span></article>
   </div>
  </section>

  {!setupConnected ? null : <section className="workspace-panel google-ads-connection-compact">
   <div className="google-ads-connection-summary">
    <div>
     <span className="sv-kicker">Connection</span>
     <h2>Google Ads account connected</h2>
     <p>{connection?.status === "account_access_verified" ? "Servonas can manage the selected Google Ads account." : connection?.status === "account_selected" ? "Google Ads is connected and an account has been selected." : connection?.status === "oauth_connected" || connection?.status === "account_discovery_pending" || connection?.status === "account_discovery_rate_limited" ? "Google Ads is connected. Choose the right account to keep going." : "Reconnect Google Ads to continue."}</p>
    </div>
    <div className="google-ads-connection-pills">
     <span>{connection?.google_authenticated_email || "Unknown Google login"}</span>
     <span>{connection?.google_ads_customer_id || "No account selected"}</span>
     <span>{validatedManagerLabel ? "Manager account" : "Direct advertiser access"}</span>
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
      <article><strong>Connected Google account</strong><span>{connection?.google_authenticated_email || "Unknown — reconnect to verify"}</span></article>
      <article><strong>Google profile name</strong><span>{connection?.google_authenticated_name || "Unavailable"}</span></article>
      <article><strong>Access mode</strong><span>{validatedManagerLabel ? "Manager account" : "Direct advertiser access"}</span></article>
      <article><strong>Selected Google Ads account</strong><span>{connection?.google_ads_customer_id || "Not selected yet"}</span></article>
      {validatedManagerLabel && <article><strong>Validated manager account</strong><span>{validatedManagerLabel}</span></article>}
      <article><strong>Resolved login customer</strong><span>{connectionAccess?.loginCustomerId || "Direct advertiser access"}</span></article>
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

  {hasCampaigns && <section className="google-ads-primary-stack">
   <section className="google-ads-campaign-grid">
    {campaignCards.map(({ campaign, metric, effectiveGoogleStatus, effectivePrimaryStatus, primaryStatusReasons, statusSyncUnavailable, issuesAvailable, effectiveCardStatus, statusLabel }) => <article className="workspace-panel google-ads-campaign-card" key={campaign.id}>
     <header>
      <div>
       <span className="sv-kicker">Campaign</span>
       <h2>{campaign.campaign_name}</h2>
       <p>{campaign.geo_target_summary}</p>
      </div>
      <span className={`campaign-status ${effectiveCardStatus === "published" ? "sent" : effectiveCardStatus === "paused" ? "skipped" : effectiveCardStatus === "issue" || effectiveCardStatus === "failed" || effectiveCardStatus === "removed" ? "failed" : "queued"}`}>{statusLabel}</span>
     </header>
     <dl className="google-ads-facts">
      <div><dt>Budget</dt><dd>{microsToMoney(Number(campaign.daily_budget_micros))}/day</dd></div>
      <div><dt>Monthly estimate</dt><dd>{money(Number(campaign.monthly_budget_estimate_cents ?? 0))}</dd></div>
      <div><dt>Destination</dt><dd>{campaign.destination_url}</dd></div>
      <div><dt>Google campaign ID</dt><dd>{campaign.google_campaign_id ?? "Draft only"}</dd></div>
      <div><dt>Google status</dt><dd>{campaign.google_campaign_id ? (effectiveGoogleStatus ?? "Sync unavailable") : "Draft only"}</dd></div>
      <div><dt>Serving status</dt><dd>{campaign.google_campaign_id ? (effectivePrimaryStatus ? friendlyPrimaryStatus(effectivePrimaryStatus) : "Sync unavailable") : "Draft only"}</dd></div>
      <div><dt>Issues</dt><dd>{campaign.google_campaign_id ? (statusSyncUnavailable ? "Status sync unavailable" : primaryStatusReasons.length ? primaryStatusReasons.map(friendlyIssue).join(", ") : !issuesAvailable ? "Unavailable from Google" : "None reported") : "Draft only"}</dd></div>
      <div><dt>Last synced</dt><dd>{campaign.last_sync_at ? new Date(campaign.last_sync_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not synced yet"}</dd></div>
      <div><dt>Impressions</dt><dd>{metric?.impressions ?? "—"}</dd></div>
      <div><dt>Clicks</dt><dd>{metric?.clicks ?? "—"}</dd></div>
      <div><dt>CTR</dt><dd>{metric ? `${metric.ctr.toFixed(1)}%` : "—"}</dd></div>
      <div><dt>Avg CPC</dt><dd>{metric ? microsToMoney(metric.averageCpcMicros) : "—"}</dd></div>
      <div><dt>Conversions</dt><dd>{metric?.conversions ?? "—"}</dd></div>
      <div><dt>CPL</dt><dd>{metric?.conversions ? microsToMoney(metric.costPerConversionMicros) : "—"}</dd></div>
     </dl>
     {statusSyncUnavailable && <div className="workspace-notice warning">Google campaign status could not be refreshed right now. Use Refresh metrics and try again.</div>}
     {campaign.last_error && <div className="workspace-notice error">{campaign.last_error}</div>}
     <div className="google-ads-card-actions">
      {campaign.status === "draft" || campaign.status === "failed" ? <form action={publishGoogleAdsDraftAction.bind(null, businessSlug, campaign.id)}><GoogleAdsDraftSubmit label="Publish campaign" pendingLabel="Publishing campaign…" pendingDescription="Servonas is publishing this campaign to Google Ads. Please keep this page open." /></form> : <>
       {!statusSyncUnavailable && effectiveGoogleStatus !== "REMOVED" && <form action={setGoogleAdsCampaignStatusAction.bind(null, businessSlug, campaign.id, effectiveGoogleStatus === "PAUSED" ? "ENABLED" : "PAUSED")}><button className="sv-button sv-secondary">{effectiveGoogleStatus === "PAUSED" ? "Resume campaign" : "Pause campaign"}</button></form>}
       <form className="google-ads-inline-form" action={updateGoogleAdsBudgetAction.bind(null, businessSlug, campaign.id)}>
        <label>Daily budget
         <input name="dailyBudgetDollars" type="number" min="1" step="1" defaultValue={(Number(campaign.daily_budget_micros) / 1_000_000).toFixed(0)} />
        </label>
        <button className="sv-button sv-secondary">Update budget</button>
       </form>
      </>}
     </div>
     {campaign.status !== "draft" && campaign.google_ad_group_id && <form className="google-ads-inline-form" action={addGoogleAdsNegativeKeywordAction.bind(null, businessSlug, campaign.id)}>
      <label>Add negative keyword<input name="keyword" placeholder="free" /></label>
      <button className="sv-button sv-secondary">Add</button>
     </form>}
     <details className="google-ads-draft-editor">
      <summary>Review and edit campaign draft</summary>
      <form className="google-ads-form" action={updateGoogleAdsDraftAction.bind(null, businessSlug, campaign.id)}>
       <label>Campaign name<input name="campaignName" defaultValue={campaign.campaign_name} /></label>
       <label>Ad group name<input name="adGroupName" defaultValue={campaign.ad_group_name} /></label>
       <label>Destination URL<input name="destinationUrl" defaultValue={campaign.destination_url} /></label>
       <label>Daily budget<input name="dailyBudgetDollars" type="number" min="1" step="1" defaultValue={(Number(campaign.daily_budget_micros) / 1_000_000).toFixed(0)} /></label>
       <label className="wide">Keywords<textarea name="keywords" rows={5} defaultValue={items(campaign.keywords).join("\n")} /></label>
       <label className="wide">Negative keywords<textarea name="negativeKeywords" rows={4} defaultValue={items(campaign.negative_keywords).join("\n")} /></label>
       <label className="wide">Headlines<textarea name="headlines" rows={5} defaultValue={items(campaign.headlines).join("\n")} /></label>
       <label className="wide">Descriptions<textarea name="descriptions" rows={4} defaultValue={items(campaign.descriptions).join("\n")} /></label>
       <div className="google-ads-form-actions"><button className="sv-button sv-secondary">Save changes</button></div>
      </form>
     </details>
    </article>)}
   </section>
   <section className="workspace-panel google-ads-performance">
    <header><div><h2>Performance</h2><p>Track spend, traffic, and conversions for the selected reporting window.</p></div></header>
    <form className="marketing-filter-bar" action={refreshGoogleAdsCampaignsAction.bind(null, businessSlug)}>
     <div className="marketing-filter-group">
      <label>From<input type="date" name="from" defaultValue={from} /></label>
      <label>To<input type="date" name="to" defaultValue={to} /></label>
      <label>Connected account<input value={connection?.google_ads_customer_id ?? "Not connected"} readOnly /></label>
     </div>
     <div className="marketing-filter-actions"><button className="sv-button">Refresh metrics</button></div>
    </form>
    <section className="marketing-kpi-grid" aria-label="Google Ads summary">
     <article className="workspace-panel"><span>Active spend</span><strong>{microsToMoney(metricsTotals.spendMicros)}</strong><small>Google bills the connected account directly</small></article>
     <article className="workspace-panel"><span>Impressions</span><strong>{metricsTotals.impressions}</strong><small>Within the selected date range</small></article>
     <article className="workspace-panel"><span>Clicks</span><strong>{metricsTotals.clicks}</strong><small>{ctr.toFixed(1)}% CTR</small></article>
     <article className="workspace-panel"><span>Conversions</span><strong>{metricsTotals.conversions}</strong><small>Google Ads-reported conversions</small></article>
     <article className="workspace-panel"><span>Estimated CPL</span><strong>{metricsTotals.conversions ? microsToMoney(cplMicros) : "—"}</strong><small>Cost per conversion</small></article>
    </section>
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

  <section className="workspace-panel google-ads-builder">
   <header><div><h2>{hasCampaigns ? "Create another campaign" : "Build your first campaign"}</h2><p>{hasCampaigns ? "You already have a campaign in place. Open the builder when you want to launch another offer." : "Choose the offer, pick a location focus, set a budget, and let Servonas generate a draft you can review before publishing."}</p></div></header>
   {hasCampaigns ? <details className="google-ads-create-more">
    <summary>Open campaign builder</summary>
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
    <label>Destination website
     <input readOnly value={website?.custom_domain || (website?.public_slug ? `${process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com"}/sites/${website.public_slug}` : `${process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com"}/book/${business.slug}`)} />
    </label>
    <div className="google-ads-form-actions"><GoogleAdsDraftSubmit /></div>
   </form>}
  </section>

  {!hasCampaigns && <section className="workspace-panel marketing-empty-state"><strong>No Google Ads campaigns yet</strong><p>Connect Google Ads, generate a draft, and publish your first simple search campaign from Servonas.</p></section>}

  <section className="marketing-secondary-grid">
   <article className="workspace-panel">
    <h2>Search terms</h2>
    {topSearchTerms.length ? <div className="marketing-sources-table"><div><b>Term</b><b>Clicks</b><b>CTR</b><b>Conversions</b><b>Cost</b></div>{topSearchTerms.slice(0, 8).map((term) => <div key={`${term.campaignId}:${term.term}`}><span>{term.term}</span><span>{term.clicks}</span><span>{term.ctr.toFixed(1)}%</span><span>{term.conversions}</span><span>{microsToMoney(term.costMicros)}</span></div>)}</div> : <div className="google-ads-compact-empty"><strong>Search terms are not ready yet.</strong><p>Search terms will appear after Google records traffic for this campaign.</p></div>}
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
 </section></main>;
}
