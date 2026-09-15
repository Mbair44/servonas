import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { adPlatformStateCopy, loadAdPlatformStatuses } from "@/lib/adPlatform";
import { getAccessibleMetaAdAccounts, metaAdsReadyLabel, type MetaAdsAccount } from "@/lib/metaAdsManagement";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { MetaAdsSyncButton } from "./MetaAdsSyncButton";
import { buildMetaCampaignTraffic } from "@/lib/metaCampaignTraffic";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default async function MetaAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string; error?: string; success?: string }>;
}) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can manage Meta Ads.</div></section></main>;
  const today = new Date().toISOString().slice(0, 10);
  const from = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : `${today.slice(0, 8)}01`;
  const to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : today;
  const reportingDb = getSupabaseAdmin() ?? supabase;
  const [statuses, connectionResult, rowsResult, syncEventsResult, promotionsResult, sessionsResult, funnelEventsResult] = await Promise.all([
    loadAdPlatformStatuses(reportingDb, business.id, `${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`),
    reportingDb.from("business_ad_platform_connections").select("*").eq("business_id", business.id).eq("provider", "meta").maybeSingle(),
    supabase.from("business_ad_platform_daily_performance").select("report_date,campaign_id,campaign_name,spend_amount,impressions,reach,clicks,link_clicks,landing_page_views,ctr,cpc_amount,cpm_amount").eq("business_id", business.id).eq("provider", "meta").gte("report_date", from).lte("report_date", to).order("report_date", { ascending: false }),
    supabase.from("business_ad_platform_sync_events").select("stage,outcome,rows_synced,error_category,error_code,created_at").eq("business_id", business.id).eq("provider", "meta").order("created_at", { ascending: false }).limit(10),
    reportingDb.from("promotions").select("id,name,slug").eq("business_id",business.id).order("created_at",{ascending:false}),
    reportingDb.from("booking_attribution_sessions").select("id,first_landing_path,first_landing_url,utm_source,utm_medium,utm_campaign,fbclid").eq("business_id",business.id).gte("session_started_at",`${from}T00:00:00.000Z`).lte("session_started_at",`${to}T23:59:59.999Z`).limit(5000),
    reportingDb.from("booking_funnel_events").select("attribution_session_id,event_name,metadata").eq("business_id",business.id).gte("occurred_at",`${from}T00:00:00.000Z`).lte("occurred_at",`${to}T23:59:59.999Z`).in("event_name",["promotion_landing_view","checkout_started","initiate_checkout","booking_completed","purchase","payment_completed"]).limit(10000),
  ]);
  const status = statuses.find((entry) => entry.provider === "meta")!;
  const copy = adPlatformStateCopy(status.state);
  const connection = connectionResult.data;
  const rows = rowsResult.data ?? [];
  const syncEvents = syncEventsResult.data ?? [];
  const trafficRows=buildMetaCampaignTraffic({promotions:promotionsResult.data??[],performance:rows,sessions:sessionsResult.data??[],events:funnelEventsResult.data??[]});
  let accessibleAccounts: MetaAdsAccount[] = [];
  let accountLoadError: string | null = null;
  if (connection?.credential_secret_id) {
    try {
      accessibleAccounts = await getAccessibleMetaAdAccounts({ businessId: business.id, businessSlug: business.slug });
    } catch (error) {
      accountLoadError = error instanceof Error ? error.message : "Meta ad accounts could not be loaded.";
    }
  }

  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page google-ads-page">
    <header className="marketing-analytics-header">
      <div><span className="sv-kicker">Marketing</span><h1>Meta Ads</h1><p>Connect each tenant’s own Meta ad account so Servonas can pull read-only spend and performance into attribution and ROAS.</p><small>{business.name}</small></div>
    </header>
    <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`}>Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`}>Google Ads</Link><Link href={`/app/${businessSlug}/marketing/meta-ads`} aria-current="page">Meta Ads</Link><Link href={`/app/${businessSlug}/marketing/seo`}>Local SEO</Link></nav>
    {query.error && <div className="workspace-notice error">{query.error}</div>}
    {query.success && <div className="workspace-notice success">{query.success}</div>}
    {metaAdsReadyLabel() !== "ready" && <div className="workspace-notice error">Meta Ads is not fully configured. Add `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI` before connecting tenants.</div>}
    <section className="workspace-panel google-ads-connection-panel">
      <div>
        <h2>Meta Ads connection</h2>
        <p>{copy.title}. {copy.detail}</p>
      </div>
      <div className="google-ads-connection-actions">
        <a className="sv-button" href={`/api/meta-ads/connect/${businessSlug}`}>{status.state === "not_connected" ? "Connect Meta Ads" : "Reconnect Meta Ads"}</a>
        <MetaAdsSyncButton businessSlug={businessSlug} disabled={!status.accountId} />
        <form action={`/api/meta-ads/disconnect/${businessSlug}`} method="post"><button className="sv-button sv-secondary">Disconnect</button></form>
      </div>
    </section>
    <section className="marketing-kpi-grid">
      <article className="workspace-panel"><span>Selected ad account</span><strong>{status.accountName || status.accountId || "Not selected"}</strong><small>{status.accountId || "Connect and select an ad account"}</small></article>
      <article className="workspace-panel"><span>Spend</span><strong>{money(status.spendCents)}</strong><small>Within the selected date range</small></article>
      <article className="workspace-panel"><span>Impressions</span><strong>{status.impressions}</strong><small>Meta-reported impressions</small></article>
      <article className="workspace-panel"><span>Reach</span><strong>{status.reach}</strong><small>Meta-reported reach</small></article>
      <article className="workspace-panel"><span>Clicks</span><strong>{status.clicks}</strong><small>{status.ctr != null ? `${(status.ctr * 100).toFixed(1)}% CTR` : "CTR unavailable"}</small></article>
      <article className="workspace-panel"><span>Landing page views</span><strong>{status.landingPageViews}</strong><small>Normalized from Meta actions</small></article>
      <article className="workspace-panel"><span>CPC</span><strong>{status.cpcCents != null ? money(status.cpcCents) : "—"}</strong><small>Cost per click</small></article>
      <article className="workspace-panel"><span>CPM</span><strong>{status.cpmCents != null ? money(status.cpmCents) : "—"}</strong><small>Cost per thousand impressions</small></article>
      <article className="workspace-panel"><span>Last sync</span><strong>{status.lastSuccessfulSyncAt ? new Date(status.lastSuccessfulSyncAt).toLocaleString() : "Never"}</strong><small>{connection?.last_sync_error || "No current sync error"}</small></article>
    </section>
    <section className="workspace-panel meta-campaign-traffic">
      <header><div><h2>Campaign traffic diagnostic</h2><p>Servonas unique landing sessions are the canonical landing count. Meta outbound or link clicks appear when campaign insights are available.</p></div></header>
      <form className="marketing-filter-bar"><div className="marketing-filter-group"><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label></div><div className="marketing-filter-actions"><button className="sv-button sv-secondary">Apply</button></div></form>
      <div className="marketing-sources-table meta-campaign-traffic-table"><div><b>Promotion / campaign</b><b>Meta outbound/link clicks</b><b>Unique landing sessions</b><b>Promotion views</b><b>fbclid</b><b>Meta UTMs</b><b>Checkout starts</b><b>Bookings / purchases</b><b>Conversion</b></div>{trafficRows.map(row=><div key={row.key}><span><strong>{row.label}</strong><small>{row.kind==="promotion"?"Promotion":"Meta campaign"} · {row.detail}</small></span><span>{row.metaLinkClicks??"—"}</span><span><strong>{row.uniqueLandingSessions}</strong></span><span>{row.promotionLandingViews}</span><span>{row.fbclidSessions}</span><span>{row.metaUtmSessions}</span><span>{row.checkoutStarts}</span><span>{row.bookings} / {row.purchases}</span><span><strong>{row.landingToCheckout==null?"—":`${(row.landingToCheckout*100).toFixed(1)}%`}</strong><small>landing → checkout</small><strong>{row.landingToBooking==null?"—":`${(row.landingToBooking*100).toFixed(1)}%`}</strong><small>landing → booking</small></span></div>)}{!trafficRows.length&&<div className="dashboard-empty"><strong>No campaign traffic in this range.</strong><p>Sync Meta Ads or open a promotion page to begin collecting diagnostics.</p></div>}</div>
    </section>
    <section className="workspace-panel">
      <header><div><h2>Account selection</h2><p>If Meta returns several ad accounts, select the tenant-owned account Servonas should use.</p></div></header>
      {accountLoadError && <div className="workspace-notice error">{accountLoadError}</div>}
      <form className="google-ads-inline-form" action={`/api/meta-ads/select-account/${businessSlug}`} method="post">
        <label>Meta ad account
          <select name="adAccountId" required defaultValue={status.accountId || ""}>
            <option value="" disabled>{accessibleAccounts.length ? "Choose an ad account" : "No accessible ad accounts found"}</option>
            {accessibleAccounts.map(account => <option key={account.id} value={account.accountId}>{account.name} - {account.accountId}</option>)}
          </select>
        </label>
        <button className="sv-button sv-secondary" disabled={!accessibleAccounts.length}>Save account</button>
      </form>
      <small>{accessibleAccounts.length ? `${accessibleAccounts.length} Meta ad account${accessibleAccounts.length === 1 ? "" : "s"} available to this connection.` : "Reconnect Meta Ads if the expected account is not listed."}</small>
    </section>
    <section className="workspace-panel">
      <header><div><h2>Pilot diagnostics</h2><p>Tenant-scoped diagnostics for verifying pilot rollout without exposing credentials.</p></div></header>
      <div className="google-ads-audit-list">
        <article><strong>Provider</strong><span>meta</span></article>
        <article><strong>Business ID</strong><span>{business.id}</span></article>
        <article><strong>Selected ad account</strong><span>{status.accountId || "Not selected"}</span></article>
        <article><strong>Connection status</strong><span>{status.state}</span></article>
        <article><strong>Token status</strong><span>{connection?.credential_secret_id ? "stored_in_vault" : "missing"}</span></article>
        <article><strong>Last sync</strong><span>{status.lastSuccessfulSyncAt ? new Date(status.lastSuccessfulSyncAt).toLocaleString() : "Never"}</span></article>
        <article><strong>Rows synced</strong><span>{status.rowsSynced}</span></article>
        <article><strong>Latest sync error</strong><span>{status.lastSyncError || "None"}</span></article>
      </div>
    </section>
    <section className="workspace-panel">
      <header><div><h2>Recent sync events</h2><p>Structured diagnostics for OAuth, selection, and sync behavior.</p></div></header>
      <div className="marketing-sources-table"><div><b>When</b><b>Stage</b><b>Outcome</b><b>Rows</b><b>Error</b></div>{syncEvents.map((row, index) => <div key={`${row.created_at}-${index}`}><span>{new Date(row.created_at).toLocaleString()}</span><span>{row.stage}</span><span>{row.outcome}</span><span>{row.rows_synced ?? "—"}</span><span>{row.error_category || row.error_code || "—"}</span></div>)}</div>
    </section>
    <section className="workspace-panel">
      <header><div><h2>Daily performance</h2><p>Tenant-scoped Meta daily performance rows used in spend reporting.</p></div></header>
      <div className="marketing-sources-table"><div><b>Date</b><b>Spend</b><b>Impressions</b><b>Reach</b><b>Clicks</b><b>LPVs</b></div>{rows.map((row) => <div key={row.report_date}><span>{row.report_date}</span><span>{money(Math.round(Number(row.spend_amount ?? 0) * 100))}</span><span>{row.impressions}</span><span>{row.reach}</span><span>{row.clicks}</span><span>{row.landing_page_views}</span></div>)}</div>
    </section>
  </section></main>;
}
