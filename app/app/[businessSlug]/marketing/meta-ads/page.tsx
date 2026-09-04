import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { adPlatformStateCopy, loadAdPlatformStatuses } from "@/lib/adPlatform";
import { metaAdsReadyLabel } from "@/lib/metaAdsManagement";

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
  const [statuses, connectionResult, rowsResult, syncEventsResult] = await Promise.all([
    loadAdPlatformStatuses(supabase, business.id, `${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`),
    supabase.from("business_ad_platform_connections").select("*").eq("business_id", business.id).eq("provider", "meta").maybeSingle(),
    supabase.from("business_ad_platform_daily_performance").select("report_date,spend_amount,impressions,reach,clicks,landing_page_views,ctr,cpc_amount,cpm_amount").eq("business_id", business.id).eq("provider", "meta").gte("report_date", from).lte("report_date", to).order("report_date", { ascending: false }),
    supabase.from("business_ad_platform_sync_events").select("stage,outcome,rows_synced,error_category,error_code,created_at").eq("business_id", business.id).eq("provider", "meta").order("created_at", { ascending: false }).limit(10),
  ]);
  const status = statuses.find((entry) => entry.provider === "meta")!;
  const copy = adPlatformStateCopy(status.state);
  const connection = connectionResult.data;
  const rows = rowsResult.data ?? [];
  const syncEvents = syncEventsResult.data ?? [];

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
        <form action={`/api/meta-ads/sync/${businessSlug}`} method="post"><button className="sv-button sv-secondary">Sync now</button></form>
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
    <section className="workspace-panel">
      <header><div><h2>Account selection</h2><p>If Meta returns several ad accounts, select the tenant-owned account Servonas should use.</p></div></header>
      <form className="google-ads-inline-form" action={`/api/meta-ads/select-account/${businessSlug}`} method="post">
        <label>Meta ad account
          <input name="adAccountId" placeholder="Enter Meta ad account id, for example 1234567890" defaultValue={status.accountId || ""} />
        </label>
        <button className="sv-button sv-secondary">Save account</button>
      </form>
      <small>Available account discovery is exposed by `GET /api/meta-ads/accounts/{businessSlug}` for admin diagnostics and picker clients.</small>
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
