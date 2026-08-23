import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isServonasPlatformAdmin } from "@/lib/platformAccess";

export default async function GoogleAdsBetaAdminPage() {
 const session = await createSupabaseServerClient();
 const { data: { user } } = await session.auth.getUser();
 if (!isServonasPlatformAdmin(user)) redirect("/app");
 const admin = getSupabaseAdmin();
 if (!admin) return <main className="admin-entitlements"><p>Private analytics access is not configured.</p></main>;

 const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
 const [{ data: events, error }, { data: feedback }, { data: businesses }] = await Promise.all([
  admin.from("business_google_ads_beta_events").select("business_id,event_name,metadata,occurred_at").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(400),
  admin.from("business_google_ads_beta_feedback").select("business_id,rating,feedback,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
  admin.from("businesses").select("id,name,slug").order("created_at", { ascending: false }).limit(500),
 ]);

 const businessById = new Map((businesses ?? []).map((business) => [business.id, business]));
 const summary = new Map<string, { businessId: string; viewed: number; connected: number; billingReady: number; generated: number; published: number; failed: number; feedbackCount: number }>();
 for (const row of events ?? []) {
  const bucket = summary.get(row.business_id) ?? { businessId: row.business_id, viewed: 0, connected: 0, billingReady: 0, generated: 0, published: 0, failed: 0, feedbackCount: 0 };
  if (row.event_name === "google_ads_beta_viewed") bucket.viewed++;
  if (row.event_name === "google_ads_connected") bucket.connected++;
  if (row.event_name === "google_ads_billing_ready") bucket.billingReady++;
  if (row.event_name === "google_ads_campaign_generated") bucket.generated++;
  if (row.event_name === "google_ads_campaign_published") bucket.published++;
  if (row.event_name === "google_ads_campaign_publish_failed") bucket.failed++;
  summary.set(row.business_id, bucket);
 }
 for (const row of feedback ?? []) {
  const bucket = summary.get(row.business_id) ?? { businessId: row.business_id, viewed: 0, connected: 0, billingReady: 0, generated: 0, published: 0, failed: 0, feedbackCount: 0 };
  bucket.feedbackCount++;
  summary.set(row.business_id, bucket);
 }

 return <main className="admin-entitlements"><header><div><span className="sv-kicker">Servonas marketing</span><h1>Google Ads beta</h1><p>Monitor adoption, launch blockers, and support feedback across the last 30 days.</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href="/app/admin/marketing/acquisition">Acquisition funnel</Link><Link className="sv-button sv-secondary" href="/admin">Admin dashboard</Link></div></header>
  {error ? <p className="workspace-notice error">Google Ads beta analytics could not be loaded. Apply the latest Google Ads beta migration.</p> : <>
   <section className="admin-acquisition-stages">
    <article><span>Businesses active</span><strong>{summary.size}</strong></article>
    <article><span>Accounts connected</span><strong>{(events ?? []).filter((row) => row.event_name === "google_ads_connected").length}</strong></article>
    <article><span>Billing ready</span><strong>{(events ?? []).filter((row) => row.event_name === "google_ads_billing_ready").length}</strong></article>
    <article><span>Drafts generated</span><strong>{(events ?? []).filter((row) => row.event_name === "google_ads_campaign_generated").length}</strong></article>
    <article><span>Campaigns published</span><strong>{(events ?? []).filter((row) => row.event_name === "google_ads_campaign_published").length}</strong></article>
    <article><span>Publish failures</span><strong>{(events ?? []).filter((row) => row.event_name === "google_ads_campaign_publish_failed").length}</strong></article>
    <article><span>Feedback notes</span><strong>{feedback?.length ?? 0}</strong></article>
   </section>
   <section className="workspace-panel">
    <h2>Business rollout view</h2>
    <div className="admin-acquisition-table">
     <div><b>Business</b><b>Connected</b><b>Billing ready</b><b>Drafts</b><b>Published</b><b>Failures</b><b>Feedback</b></div>
     {[...summary.values()].sort((a, b) => b.published - a.published || b.generated - a.generated).map((row) => {
      const business = businessById.get(row.businessId);
      return <div key={row.businessId}><span>{business?.name ?? row.businessId}</span><span>{row.connected}</span><span>{row.billingReady}</span><span>{row.generated}</span><span>{row.published}</span><span>{row.failed}</span><span>{row.feedbackCount}</span></div>;
     })}
    </div>
   </section>
   <section className="workspace-panel">
    <h2>Recent beta events</h2>
    <div className="admin-acquisition-table">
     <div><b>When</b><b>Business</b><b>Event</b><b>Metadata</b></div>
     {(events ?? []).slice(0, 40).map((row, index) => <div key={`${row.business_id}-${row.event_name}-${index}`}><span>{new Date(row.occurred_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span><span>{businessById.get(row.business_id)?.name ?? row.business_id}</span><span>{row.event_name}</span><span>{JSON.stringify(row.metadata ?? {}).slice(0, 140) || "—"}</span></div>)}
    </div>
   </section>
   <section className="workspace-panel">
    <h2>Recent feedback</h2>
    <div className="google-ads-audit-list">
     {(feedback ?? []).length ? (feedback ?? []).map((row, index) => <article key={`${row.business_id}-${index}`}><strong>{businessById.get(row.business_id)?.name ?? row.business_id} · {row.rating}</strong><span>{row.feedback || "No written note provided."}</span></article>) : <p>No feedback has been submitted yet.</p>}
    </div>
   </section>
  </>}
 </main>;
}
