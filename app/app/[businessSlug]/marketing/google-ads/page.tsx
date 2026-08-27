import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import {
 fetchGoogleAdsCampaignMetrics,
  fetchGoogleAdsSearchTerms,
  googleAdsReadyLabel,
 recordGoogleAdsBetaEvent,
  type GoogleAdsCustomer,
  loadTenantGoogleAdsAccess,
} from "@/lib/googleAdsManagement";
import {
 addGoogleAdsNegativeKeywordAction,
 createGoogleAdsDraftAction,
 disconnectGoogleAds,
 markGoogleAdsBillingReadyAction,
 publishGoogleAdsDraftAction,
 refreshGoogleAdsCampaignsAction,
 selectGoogleAdsCustomer,
 submitGoogleAdsBetaFeedbackAction,
 setGoogleAdsCampaignStatusAction,
 updateGoogleAdsBudgetAction,
 updateGoogleAdsDraftAction,
} from "./actions";

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

export default async function GoogleAdsPage({
 params,
 searchParams,
}: {
 params: Promise<{ businessSlug: string }>;
 searchParams: Promise<{ from?: string; to?: string; error?: string; success?: string }>;
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
  supabase.from("business_google_ads_connections").select("google_ads_customer_id,accessible_customer_ids,accessible_customer_labels,status").eq("business_id", business.id).maybeSingle(),
  supabase.from("business_google_ads_campaigns").select("*").eq("business_id", business.id).order("updated_at", { ascending: false }),
  supabase.from("business_google_ads_audit_log").select("event_type,metadata,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(8),
  supabase.from("business_google_ads_beta_events").select("event_name,metadata,occurred_at").eq("business_id", business.id).order("occurred_at", { ascending: false }).limit(40),
  supabase.from("business_google_ads_beta_feedback").select("rating,feedback,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(5),
 ]);

 let connectionAccess: Awaited<ReturnType<typeof loadTenantGoogleAdsAccess>> | null = null;
 let connectionError: string | null = null;
 let metricsByCampaignId = new Map<string, Awaited<ReturnType<typeof fetchGoogleAdsCampaignMetrics>>[number]>();
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
    topSearchTerms = await fetchGoogleAdsSearchTerms({
     accessToken: connectionAccess.accessToken,
     customerId: connectionAccess.customerId,
     campaignIds: publishedIds,
     dateFrom: from,
     dateTo: to,
    });
   }
  } catch (error) {
   connectionError = error instanceof Error ? error.message : "Google Ads access could not be refreshed.";
  }
 }

 const customerChoices: GoogleAdsCustomer[] = (connection?.accessible_customer_ids ?? []).map((id: string) => ({
  id,
  label: String((connection?.accessible_customer_labels as Record<string, unknown> | null)?.[id] ?? id),
 }));
 const hasOfferOptions = Boolean((services?.length ?? 0) || (inventory?.length ?? 0));
 const publishedCampaigns = (campaigns ?? []).filter((campaign: any) => ["published", "paused"].includes(campaign.status));
 const selectedCustomerId = connection?.google_ads_customer_id ?? null;
 const betaEventNames = new Set((betaEvents ?? []).map((event: any) => String(event.event_name)));
 const billingReady = betaEventNames.has("google_ads_billing_ready") || publishedCampaigns.length > 0;
 const latestFeedback = betaFeedback?.[0] ?? null;
 const businessInfoReady = Boolean(business.name && business.email && (business.city || business.state));
 const landingPageReady = Boolean(website?.custom_domain || website?.public_slug);
 const setupReady = Boolean(connection?.status && connection.status !== "disconnected");
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
  {query.error && <div className="workspace-notice error">{query.error}</div>}
  {query.success && <div className="workspace-notice success">{query.success}</div>}
  {connectionError && <div className="workspace-notice error">{connectionError}</div>}
  {googleAdsReadyLabel() !== "ready" && <div className="workspace-notice error">Google Ads is not fully configured. Add `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, and `GOOGLE_ADS_DEVELOPER_TOKEN` before connecting tenants.</div>}
  <section className="workspace-panel google-ads-beta-hero">
   <div>
    <span className="sv-kicker">Included during beta</span>
    <h2>Servonas Ads Beta helps you launch faster</h2>
    <p>Tell Servonas what you want to promote and how much you want to spend. You keep control of your Google Ads account and Google bills your advertising budget directly.</p>
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
  </section>
  <section className="workspace-panel google-ads-readiness">
   <header><div><h2>Google Ads setup</h2><p>Use this checklist to move from connection to launch without confusion.</p></div></header>
   <div className="google-ads-readiness-grid">
    <article className={setupReady ? "is-complete" : ""}><strong>{setupReady ? "✓" : "○"} Google account connected</strong><small>{setupReady ? "Servonas can talk to Google Ads for this workspace." : "Start by connecting the Google account that owns or manages your Google Ads account."}</small></article>
    <article className={selectedCustomerId ? "is-complete" : ""}><strong>{selectedCustomerId ? "✓" : "○"} Google Ads account selected</strong><small>{selectedCustomerId ? `Account ${selectedCustomerId} is selected for ${business.name}.` : "If Google returned multiple accounts, choose the one this business should use."}</small></article>
    <article className={businessInfoReady ? "is-complete" : ""}><strong>{businessInfoReady ? "✓" : "○"} Business information ready</strong><small>{businessInfoReady ? "Servonas already has enough business details to draft ads." : "Add missing business profile details like email, city, or state before launch."}</small></article>
    <article className={landingPageReady ? "is-complete" : ""}><strong>{landingPageReady ? "✓" : "○"} Landing page ready</strong><small>{landingPageReady ? "You have a destination page ready for ad traffic." : "Publish a website or booking page so Google Ads has somewhere to send clicks."}</small></article>
    <article className={billingReady ? "is-complete" : "is-attention"}><strong>{billingReady ? "✓" : "○"} Google billing setup</strong><small>{billingReady ? "Billing has been confirmed or a campaign has already launched." : "Google requires a payment method before ads can run. Servonas does not receive or store this payment information."}</small></article>
    <article className={campaigns?.length ? "is-complete" : ""}><strong>{campaigns?.length ? "✓" : "○"} Campaign ready</strong><small>{campaigns?.length ? "A campaign draft exists and can be reviewed before publishing." : "Choose the service, area, and budget below to generate your first draft."}</small></article>
   </div>
   {!setupReady ? <div className="google-ads-readiness-actions">
    <a className="sv-button" href={`/api/google-ads/connect/${businessSlug}`}>Connect Google Ads</a>
    <a className="sv-button sv-secondary" href={accountCreateUrl} target="_blank" rel="noopener noreferrer">Create Google Ads Account</a>
   </div> : !billingReady ? <div className="google-ads-readiness-actions">
    <a className="sv-button" href={billingUrl(selectedCustomerId)} target="_blank" rel="noopener noreferrer">Complete Billing with Google</a>
    <form action={markGoogleAdsBillingReadyAction.bind(null, businessSlug)}>
     <input type="hidden" name="customerId" value={selectedCustomerId ?? ""} />
     <button className="sv-button sv-secondary">I finished billing setup</button>
    </form>
   </div> : null}
  </section>
  <section className="workspace-panel google-ads-connection-panel">
   <div>
    <h2>Connect Google Ads</h2>
    <p>Connect your Google Ads account so Servonas can help build and manage your campaigns. Google stays responsible for billing, spend, delivery, and policy review.</p>
   </div>
   {!connection || connection.status === "disconnected" ? <div className="google-ads-connection-actions"><a className="sv-button" href={`/api/google-ads/connect/${businessSlug}`}>Connect Google Ads</a></div> : <>
    <div className="google-ads-connection-state">
     <strong>{connection.status === "connected" ? "Connected to Google Ads" : connection.status === "pending_selection" ? "Connected, account selection needed" : "Reauthorization required"}</strong>
     <span>Account: {connection.google_ads_customer_id || "Not selected yet"}</span>
    </div>
    {customerChoices.length > 1 && <form className="google-ads-inline-form" action={selectGoogleAdsCustomer.bind(null, businessSlug)}>
     <label>Google Ads account
      <select name="customerId" defaultValue={connection.google_ads_customer_id ?? ""}>
       <option value="">Choose account</option>
       {customerChoices.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}
      </select>
     </label>
     <button className="sv-button sv-secondary">Save account</button>
    </form>}
    {!customerChoices.length && <div className="workspace-notice warning">No Google Ads accounts were returned for this login. If you do not have one yet, create it in Google first, then reconnect it here.</div>}
    {!customerChoices.length && <div className="google-ads-connection-actions"><a className="sv-button sv-secondary" href={accountCreateUrl} target="_blank" rel="noopener noreferrer">Create Google Ads Account</a></div>}
    <form action={disconnectGoogleAds.bind(null, businessSlug)}><button className="sv-button sv-secondary">Disconnect</button></form>
   </>}
  </section>
  <form className="workspace-panel marketing-filter-bar" action={refreshGoogleAdsCampaignsAction.bind(null, businessSlug)}>
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
   <header><div><h2>Create a simple campaign</h2><p>Choose the offer, pick a location focus, set a budget, and let Servonas generate a draft you can review before publishing.</p></div></header>
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
    <div className="google-ads-form-actions"><button className="sv-button">Generate campaign draft</button></div>
   </form>
  </section>
  <section className="google-ads-campaign-grid">
   {(campaigns ?? []).map((campaign: any) => {
    const metric = campaign.google_campaign_id ? metricsByCampaignId.get(String(campaign.google_campaign_id)) : null;
    return <article className="workspace-panel google-ads-campaign-card" key={campaign.id}>
     <header>
      <div>
       <span className="sv-kicker">Search campaign</span>
       <h2>{campaign.campaign_name}</h2>
       <p>{campaign.geo_target_summary}</p>
      </div>
      <span className={`campaign-status ${campaign.status === "published" ? "sent" : campaign.status === "paused" ? "skipped" : campaign.status === "failed" ? "failed" : "queued"}`}>{campaign.status}</span>
     </header>
     <dl className="google-ads-facts">
      <div><dt>Budget</dt><dd>{microsToMoney(Number(campaign.daily_budget_micros))}/day</dd></div>
      <div><dt>Monthly estimate</dt><dd>{money(Number(campaign.monthly_budget_estimate_cents ?? 0))}</dd></div>
      <div><dt>Destination</dt><dd>{campaign.destination_url}</dd></div>
      <div><dt>Google campaign ID</dt><dd>{campaign.google_campaign_id ?? "Draft only"}</dd></div>
      <div><dt>Impressions</dt><dd>{metric?.impressions ?? "—"}</dd></div>
      <div><dt>Clicks</dt><dd>{metric?.clicks ?? "—"}</dd></div>
      <div><dt>CTR</dt><dd>{metric ? `${metric.ctr.toFixed(1)}%` : "—"}</dd></div>
      <div><dt>Avg CPC</dt><dd>{metric ? microsToMoney(metric.averageCpcMicros) : "—"}</dd></div>
      <div><dt>Conversions</dt><dd>{metric?.conversions ?? "—"}</dd></div>
      <div><dt>CPL</dt><dd>{metric?.conversions ? microsToMoney(metric.costPerConversionMicros) : "—"}</dd></div>
     </dl>
     {campaign.last_error && <div className="workspace-notice error">{campaign.last_error}</div>}
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
     <div className="google-ads-card-actions">
      {campaign.status === "draft" || campaign.status === "failed" ? <form action={publishGoogleAdsDraftAction.bind(null, businessSlug, campaign.id)}><button className="sv-button">Publish campaign</button></form> : <>
       <form action={setGoogleAdsCampaignStatusAction.bind(null, businessSlug, campaign.id, campaign.status === "paused" ? "ENABLED" : "PAUSED")}><button className="sv-button sv-secondary">{campaign.status === "paused" ? "Resume" : "Pause"}</button></form>
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
    </article>;
   })}
   {!campaigns?.length && <section className="workspace-panel marketing-empty-state"><strong>No Google Ads campaigns yet</strong><p>Connect Google Ads, generate a draft, and publish your first simple search campaign from Servonas.</p></section>}
  </section>
  <section className="marketing-secondary-grid">
   <article className="workspace-panel">
    <h2>Search terms</h2>
    {topSearchTerms.length ? <div className="marketing-sources-table"><div><b>Term</b><b>Clicks</b><b>CTR</b><b>Conversions</b><b>Cost</b></div>{topSearchTerms.slice(0, 8).map((term) => <div key={`${term.campaignId}:${term.term}`}><span>{term.term}</span><span>{term.clicks}</span><span>{term.ctr.toFixed(1)}%</span><span>{term.conversions}</span><span>{microsToMoney(term.costMicros)}</span></div>)}</div> : <p>Search term insights will appear here when Google returns them for published campaigns.</p>}
   </article>
   <article className="workspace-panel">
    <h2>Recent Google Ads activity</h2>
    <div className="google-ads-audit-list">{(auditLog ?? []).map((entry: any) => <article key={`${entry.event_type}-${entry.created_at}`}><strong>{entry.event_type.replaceAll("_", " ")}</strong><span>{new Date(entry.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span></article>)}</div>
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
