import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isServonasPlatformAdmin } from "@/lib/platformAccess";

export default async function MetaAdsAdminPage() {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!isServonasPlatformAdmin(user)) redirect("/app");
  const admin = getSupabaseAdmin();
  if (!admin) return <main className="admin-entitlements"><p>Private analytics access is not configured.</p></main>;
  const [{ data: connections }, { data: syncEvents }, { data: businesses }] = await Promise.all([
    admin.from("business_ad_platform_connections").select("business_id,provider,external_account_id,external_account_name,status,last_successful_sync_at,last_sync_error,last_sync_rows").eq("provider", "meta").order("updated_at", { ascending: false }),
    admin.from("business_ad_platform_sync_events").select("business_id,provider,external_account_id,stage,outcome,rows_synced,error_category,error_code,created_at").eq("provider", "meta").order("created_at", { ascending: false }).limit(100),
    admin.from("businesses").select("id,name,slug").order("created_at", { ascending: false }).limit(500),
  ]);
  const businessById = new Map((businesses ?? []).map((row) => [row.id, row]));
  return <main className="admin-entitlements"><header><div><span className="sv-kicker">Servonas marketing</span><h1>Meta Ads pilot</h1><p>Business rollout and diagnostics for tenant Meta Ads connections.</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href="/app/admin/marketing/google-ads">Google Ads beta</Link><Link className="sv-button sv-secondary" href="/admin">Admin dashboard</Link></div></header>
    <section className="workspace-panel">
      <h2>Business rollout view</h2>
      <div className="admin-acquisition-table">
        <div><b>Business</b><b>Provider</b><b>Ad account</b><b>Status</b><b>Last sync</b><b>Rows</b><b>Error</b></div>
        {(connections ?? []).map((row) => <div key={`${row.business_id}-${row.provider}`}><span>{businessById.get(row.business_id)?.name ?? row.business_id}</span><span>{row.provider}</span><span>{row.external_account_name || row.external_account_id || "Not selected"}</span><span>{row.status}</span><span>{row.last_successful_sync_at ? new Date(row.last_successful_sync_at).toLocaleString() : "Never"}</span><span>{row.last_sync_rows ?? 0}</span><span>{row.last_sync_error || "—"}</span></div>)}
      </div>
    </section>
    <section className="workspace-panel">
      <h2>Recent sync events</h2>
      <div className="admin-acquisition-table">
        <div><b>When</b><b>Business</b><b>Stage</b><b>Outcome</b><b>Rows</b><b>Error</b></div>
        {(syncEvents ?? []).map((row, index) => <div key={`${row.business_id}-${index}`}><span>{new Date(row.created_at).toLocaleString()}</span><span>{businessById.get(row.business_id)?.name ?? row.business_id}</span><span>{row.stage}</span><span>{row.outcome}</span><span>{row.rows_synced ?? "—"}</span><span>{row.error_category || row.error_code || "—"}</span></div>)}
      </div>
    </section>
  </main>;
}
