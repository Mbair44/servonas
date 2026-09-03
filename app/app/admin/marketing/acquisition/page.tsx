import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isServonasPlatformAdmin } from "@/lib/platformAccess";
import { acquisitionDateRange, buildAcquisitionReport, classifyAcquisitionSource } from "@/lib/acquisitionReporting";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const percent = (value: number) => `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
const formatDate = (value: string) => value.slice(0, 10);
const platformReportingTimeZone = "America/Phoenix";
const ms = (value: number | null) => value == null ? "—" : value >= 60_000 ? `${(value / 60_000).toFixed(value >= 120_000 ? 1 : 2)} min` : value >= 1_000 ? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} sec` : `${value} ms`;

export default async function AcquisitionReport({ searchParams }: { searchParams: Promise<{ industry?: string; source?: string; range?: string; from?: string; to?: string }> }) {
  const q = await searchParams;
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!isServonasPlatformAdmin(user)) redirect("/app");
  const db = getSupabaseAdmin();
  if (!db) return <main className="admin-entitlements"><p>Private analytics access is not configured.</p></main>;
  const range = q.range === "today" || q.range === "last_30_days" || q.range === "custom" ? q.range : "last_7_days";
  const window = acquisitionDateRange(range, q.from, q.to, new Date(), platformReportingTimeZone);
  let sessionsQuery = db.from("website_acquisition_sessions").select("id,industry,first_landing_path,first_landing_url,first_referrer,first_seen_at,active_duration_ms,timing_available,final_flush_received,duration_source,last_active_at,gclid,gbraid,wbraid,utm_source,utm_medium,utm_campaign,utm_term,utm_content").gte("first_seen_at", window.from).lt("first_seen_at", window.to);
  if (q.industry) sessionsQuery = sessionsQuery.eq("industry", q.industry);
  const { data: sessionRows, error } = await sessionsQuery.order("first_seen_at", { ascending: false });
  const sessionIds = (sessionRows ?? []).map((row) => row.id);
  const { data: eventRows, error: eventError } = sessionIds.length ? await db.from("website_acquisition_events").select("acquisition_session_id,event_name,occurred_at").in("acquisition_session_id", sessionIds).gte("occurred_at", window.from).lt("occurred_at", window.to) : { data: [], error: null };
  const filteredSessions = (sessionRows ?? []).filter((row) => !q.source || classifyAcquisitionSource(row) === q.source);
  const industries = [...new Set((sessionRows ?? []).map((row) => row.industry).filter(Boolean) as string[])].sort();
  const report = buildAcquisitionReport(filteredSessions, eventRows ?? []);
  return <main className="admin-entitlements"><header><div><span className="sv-kicker">Servonas acquisition</span><h1>Acquisition funnel</h1><p>See who reaches Servonas, what they engage with, and how long reliably timed visitors stay active before they convert or drop.</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href="/app/admin/marketing/google-ads">Google Ads beta</Link><Link className="sv-button sv-secondary" href="/admin">Admin dashboard</Link></div></header>
    <form className="admin-filter-form">
      <label>Industry<select name="industry" defaultValue={q.industry ?? ""}><option value="">All industries</option>{industries.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
      <label>Traffic<select name="source" defaultValue={q.source ?? ""}><option value="">All traffic</option><option value="Google Ads">Google Ads</option><option value="Organic">Organic</option><option value="Direct">Direct</option><option value="Facebook">Facebook</option><option value="Other">Other</option></select></label>
      <label>Date range<select name="range" defaultValue={range}><option value="last_7_days">Last 7 days</option><option value="last_30_days">Last 30 days</option><option value="today">Today</option><option value="custom">Custom</option></select></label>
      <label>From<input type="date" name="from" defaultValue={q.from ?? formatDate(window.from)} /></label>
      <label>To<input type="date" name="to" defaultValue={q.to ?? formatDate(window.to)} /></label>
      <button className="sv-button sv-secondary">Apply</button>
    </form>
    {error || eventError ? <p className="workspace-notice error">Acquisition analytics could not be loaded. Apply the acquisition funnel migration.</p> : <>
      <section className="admin-acquisition-stages">
        <article><span>Sessions</span><strong>{report.overall.sessions}</strong></article>
        <article><span>Signup starts</span><strong>{report.overall.signupStarts}</strong><small>{percent(report.overall.sessions ? report.overall.signupStarts / report.overall.sessions * 100 : 0)} of sessions</small></article>
        <article><span>Completed signups</span><strong>{report.overall.signups}</strong><small>{percent(report.overall.sessions ? report.overall.signups / report.overall.sessions * 100 : 0)} of sessions</small></article>
        <article><span>Builder starts</span><strong>{report.overall.builderStarts}</strong><small>{percent(report.overall.sessionToBuilderRate)} of sessions</small></article>
        <article><span>Previews</span><strong>{report.overall.previews}</strong><small>{percent(report.overall.builderToPreviewRate)} of starts</small></article>
        <article><span>Businesses</span><strong>{report.overall.businesses}</strong><small>{percent(report.overall.sessionToBusinessRate)} of sessions</small></article>
      </section>
      {report.overall.largestDropOff && <aside className="workspace-notice">Largest drop-off: <strong>{report.overall.largestDropOff.stage}</strong> ({report.overall.largestDropOff.count} sessions).</aside>}
      <section className="workspace-panel"><h2>Time on site</h2><div className="admin-acquisition-stages">
        <article><span>Reliable timing</span><strong>{percent(report.timeOnSite.reliableTimingPercentage)}</strong><small>{report.timeOnSite.reliableTimingSessions} of {report.overall.sessions} sessions</small></article>
        <article><span>Median active time</span><strong>{ms(report.timeOnSite.medianActiveTimeMs)}</strong><small>Visible-tab active time only.</small></article>
        <article><span>Average active time</span><strong>{ms(report.timeOnSite.averageActiveTimeMs)}</strong><small>Excludes unavailable timing.</small></article>
        <article><span>Max active time</span><strong>{ms(report.timeOnSite.maxActiveTimeMs)}</strong><small>Highest reliable session.</small></article>
      </div><div className="admin-acquisition-table"><div><b>Bucket</b><b>Sessions</b><b>Share</b></div>{report.timeOnSite.buckets.map((bucket) => <div key={bucket.key}><span>{bucket.label}</span><span>{bucket.count}</span><span>{percent(bucket.percentage)}</span></div>)}</div></section>
      <section className="workspace-panel"><h2>Landing page breakdown</h2><div className="admin-acquisition-table"><div><b>Landing page</b><b>Sessions</b><b>Avg active time</b><b>Median active time</b><b>Signup starts</b><b>Builder starts</b><b>Pricing views</b><b>Demo actions</b><b>Completed signups</b><b>Businesses</b><b>Drop-off</b></div>{report.landingPages.map((page) => <div key={page.path}><span>{page.path}</span><span>{page.sessions}</span><span>{ms(page.avgActiveTimeMs)}</span><span>{ms(page.medianActiveTimeMs)}</span><span>{page.signupStarts}</span><span>{page.builderStarts}</span><span>{page.pricingViews}</span><span>{page.demoActions}</span><span>{page.signups}</span><span>{page.businesses}</span><span>{page.dropOff ? `${page.dropOff.stage} · ${page.dropOff.count}` : "—"}</span></div>)}</div></section>
      <section className="workspace-panel"><h2>Traffic source summary</h2><div className="admin-acquisition-table"><div><b>Source</b><b>Sessions</b></div>{report.sourceSummary.map((source) => <div key={source.source}><span>{source.source}</span><span>{source.sessions}</span></div>)}</div></section>
      <section className="workspace-panel"><h2>Attribution drill-down</h2><div className="admin-acquisition-table"><div><b>Landing page</b><b>Source</b><b>Sessions</b><b>UTM source</b><b>UTM campaign</b><b>gclid</b><b>gbraid</b><b>wbraid</b></div>{report.attributionRows.map((row, index) => <div key={`${row.landingPage}-${row.source}-${index}`}><span>{row.landingPage}</span><span>{row.source}</span><span>{row.sessions}</span><span title={row.utmSource ?? ""}>{row.utmSource ?? "—"}</span><span title={row.utmCampaign ?? ""}>{row.utmCampaign ?? "—"}</span><span title={row.gclid ?? ""}>{row.gclid ? `${row.gclid.slice(0, 24)}…` : "—"}</span><span title={row.gbraid ?? ""}>{row.gbraid ? `${row.gbraid.slice(0, 24)}…` : "—"}</span><span title={row.wbraid ?? ""}>{row.wbraid ? `${row.wbraid.slice(0, 24)}…` : "—"}</span></div>)}</div></section>
      <section className="workspace-panel"><h2>Counting rules</h2><p>Sessions are deduplicated by unique acquisition session ID. Time on site only counts sessions that sent active-time data and a final flush, so missing timing is shown separately instead of being misclassified as a sub-second bounce.</p></section>
      <details className="workspace-panel marketing-attribution-note"><summary>Analytics diagnostics</summary><p>Window: {window.from} to {window.to} ({platformReportingTimeZone}). Global platform scope. Raw sessions: {(sessionRows ?? []).length}. Filtered sessions: {filteredSessions.length}. Raw events: {(eventRows ?? []).length}. Latest event: {((eventRows ?? []) as Array<{ occurred_at?: string | null }>).reduce<string | null>((latest, row) => row.occurred_at && (!latest || row.occurred_at > latest) ? row.occurred_at : latest, null) ?? "none"}.</p></details>
    </>}
  </main>;
}
