import Link from "next/link";
import { createAdminBusiness } from "../actions";
import { requirePlatformAdminSession } from "@/lib/adminBusinessSetup";

export default async function NewAdminBusinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePlatformAdminSession();
  const q = await searchParams;
  return <main className="platform-admin-dashboard"><header><div><span className="sv-kicker">Servonas administration</span><h1>Create Business</h1><p>Create the tenant now, finish setup inside Servonas, and invite the owner only when the account is ready.</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href="/app/admin/businesses">Back to businesses</Link></div></header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}
    <section className="workspace-panel"><form action={createAdminBusiness} className="settings-grid">
      <label>Business name<input name="businessName" required /></label>
      <label>Workspace URL<input name="slug" placeholder="junk-devils" /></label>
      <label>Industry<input name="industry" /></label>
      <label>Business phone<input name="businessPhone" /></label>
      <label>Business email<input name="businessEmail" type="email" /></label>
      <label>Website or domain<input name="websiteUrl" /></label>
      <label>City<input name="city" /></label>
      <label>State<input name="state" /></label>
      <label>ZIP<input name="postalCode" /></label>
      <label>Service area<input name="serviceArea" /></label>
      <label>Timezone<input name="timezone" defaultValue="America/Phoenix" /></label>
      <label>Customer type<select name="customerType" defaultValue="pilot"><option value="pilot">Pilot</option><option value="standard">Standard</option><option value="internal_test">Internal/Test</option></select></label>
      <label>Owner first name<input name="ownerFirstName" /></label>
      <label>Owner last name<input name="ownerLastName" /></label>
      <label>Owner email<input name="ownerEmail" type="email" required /></label>
      <label>Owner phone<input name="ownerPhone" /></label>
      <label className="settings-field-span">Internal admin notes<textarea name="internalAdminNotes" rows={5} placeholder="Internal-only notes for pilot setup." /></label>
      <div className="crm-header-actions"><button className="sv-button">Create business</button></div>
    </form></section>
  </main>;
}
