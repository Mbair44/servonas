import Link from "next/link";
import { businessAdminStatus, ownerAccessLabel, requirePlatformAdminSession } from "@/lib/adminBusinessSetup";

export const dynamic = "force-dynamic";

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { admin } = await requirePlatformAdminSession();
  const { data: businesses, error } = await admin
    .from("businesses")
    .select(`
      id,name,slug,industry_profile,created_at,
      platform_business_owner_setups(owner_first_name,owner_last_name,owner_email,owner_status,owner_invited_at,owner_activated_at,customer_type),
      platform_business_admin_state(lifecycle_status),
      business_website_settings(status),
      business_activity(created_at)
    `)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Businesses could not be loaded.");
  return <main className="platform-admin-dashboard"><header><div><span className="sv-kicker">Servonas administration</span><h1>Businesses</h1><p>Create pilot businesses, finish setup, and invite owners when the account is ready.</p></div><div className="crm-header-actions"><Link className="sv-button" href="/app/admin/businesses/new">+ Create Business</Link></div></header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}
    {q.success && <div className="workspace-notice success">{q.success}</div>}
    <section className="workspace-panel">
      <div className="panel-title"><div><h2>All businesses</h2><p>Internal setup and activation status for Servonas customers.</p></div><span>{businesses?.length ?? 0} businesses</span></div>
      <div className="platform-admin-grid">
        <div className="platform-admin-grid-row head"><span>Business</span><span>Owner</span><span>Industry</span><span>Status</span><span>Owner access</span><span>Website</span><span>Created</span></div>
        {(businesses ?? []).map((row: any) => {
          const setup = Array.isArray(row.platform_business_owner_setups) ? row.platform_business_owner_setups[0] : row.platform_business_owner_setups;
          const state = Array.isArray(row.platform_business_admin_state) ? row.platform_business_admin_state[0] : row.platform_business_admin_state;
          const website = Array.isArray(row.business_website_settings) ? row.business_website_settings[0] : row.business_website_settings;
          const lastActivity = Array.isArray(row.business_activity) ? row.business_activity[0] : row.business_activity;
          const ownerName = [setup?.owner_first_name, setup?.owner_last_name].filter(Boolean).join(" ");
          return <div className="platform-admin-grid-row" key={row.id}>
            <span><strong>{row.name}</strong><small>{row.slug}</small><Link href={`/app/admin/businesses/${row.id}`}>Manage business</Link></span>
            <span><strong>{ownerName || "Pending owner"}</strong><small>{setup?.owner_email || "No owner email"}</small>{setup?.customer_type === "pilot" && <em>Pilot</em>}</span>
            <span>{row.industry_profile || "Not set"}</span>
            <span>{businessAdminStatus({ lifecycleStatus: state?.lifecycle_status, ownerStatus: setup?.owner_status || "not_invited" })}</span>
            <span>{ownerAccessLabel(setup?.owner_status || "not_invited", setup?.owner_activated_at || setup?.owner_invited_at)}</span>
            <span>{website?.status || "Not started"}<small>{lastActivity?.created_at ? `Last activity ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(lastActivity.created_at))}` : "No activity yet"}</small></span>
            <span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(row.created_at))}</span>
          </div>;
        })}
      </div>
    </section>
  </main>;
}
