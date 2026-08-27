import Link from "next/link";
import { notFound } from "next/navigation";
import { businessAdminStatus, ownerAccessLabel, requirePlatformAdminSession } from "@/lib/adminBusinessSetup";
import { sendOwnerInvitation, updateAdminBusinessDetails } from "../actions";
import { INDUSTRY_PROFILES } from "@/lib/onboardingProfile";

export const dynamic = "force-dynamic";

export default async function AdminBusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId } = await params;
  const q = await searchParams;
  const { admin } = await requirePlatformAdminSession();
  const { data: business } = await admin
    .from("businesses")
    .select(`
      id,name,slug,email,phone,website_url,city,state,postal_code,timezone,industry_profile,
      business_platform_subscriptions(status,trial_ends_at),
      business_payment_accounts(onboarding_status,charges_enabled,payouts_enabled),
      business_website_settings(status,custom_domain),
      business_onboarding_states(status,completed_steps,current_step),
      platform_business_owner_setups(owner_first_name,owner_last_name,owner_email,owner_phone,owner_status,owner_invited_at,owner_activated_at,customer_type,service_area,internal_admin_notes,last_activation_link),
      platform_business_admin_state(lifecycle_status)
    `)
    .eq("id", businessId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!business) notFound();
  const setup = Array.isArray((business as any).platform_business_owner_setups) ? (business as any).platform_business_owner_setups[0] : (business as any).platform_business_owner_setups;
  const state = Array.isArray((business as any).platform_business_admin_state) ? (business as any).platform_business_admin_state[0] : (business as any).platform_business_admin_state;
  const website = Array.isArray((business as any).business_website_settings) ? (business as any).business_website_settings[0] : (business as any).business_website_settings;
  const subscription = Array.isArray((business as any).business_platform_subscriptions) ? (business as any).business_platform_subscriptions[0] : (business as any).business_platform_subscriptions;
  const stripe = Array.isArray((business as any).business_payment_accounts) ? (business as any).business_payment_accounts[0] : (business as any).business_payment_accounts;
  const ownerName = [setup?.owner_first_name, setup?.owner_last_name].filter(Boolean).join(" ");
  const industryLabels: Record<string, string> = {
    pest_control: "Pest control",
    lawn_care: "Lawn care",
    pool_service: "Pool service",
    hvac: "HVAC",
    plumbing: "Plumbing",
    electrical: "Electrical",
    junk_removal: "Junk removal",
    party_rental: "Party rental",
    equipment_rental: "Equipment rental",
    other: "Other",
  };
  const checklist = [
    ["Business created", true],
    ["Owner information added", Boolean(setup?.owner_email)],
    ["Services added", false],
    ["Website configured", website?.status === "published" || website?.status === "draft"],
    ["Domain connected", Boolean(website?.custom_domain)],
    ["Stripe connected", Boolean(stripe?.charges_enabled && stripe?.payouts_enabled)],
    ["Owner invited", setup?.owner_status === "invited" || setup?.owner_status === "activated"],
    ["Owner activated", setup?.owner_status === "activated"],
  ] as const;
  return <main className="platform-admin-dashboard"><header><div><span className="sv-kicker">Servonas administration</span><h1>{business.name}</h1><p>{businessAdminStatus({ lifecycleStatus: state?.lifecycle_status, ownerStatus: setup?.owner_status || "not_invited" })} · {ownerAccessLabel(setup?.owner_status || "not_invited", setup?.owner_activated_at || setup?.owner_invited_at)}</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href={`/app/${business.slug}`}>Open workspace</Link>{setup?.owner_status !== "activated" && <form action={sendOwnerInvitation}><input type="hidden" name="businessId" value={business.id} /><button className="sv-button">Invite {ownerName || "Owner"}</button></form>}</div></header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}
    {q.success && <div className="workspace-notice success">{q.success}</div>}
    <section className="platform-admin-summary">
      <article><span>Owner access</span><strong>{ownerAccessLabel(setup?.owner_status || "not_invited", setup?.owner_activated_at || setup?.owner_invited_at)}</strong><small>{setup?.owner_email || "No owner email"}</small></article>
      <article><span>Website</span><strong>{website?.status || "Not started"}</strong><small>{website?.custom_domain || "No custom domain"}</small></article>
      <article><span>Stripe</span><strong>{stripe?.onboarding_status || "Not connected"}</strong><small>{stripe?.charges_enabled ? "Payments enabled" : "Owner can connect later"}</small></article>
      <article><span>Subscription</span><strong>{subscription?.status || "Not started"}</strong><small>{setup?.customer_type === "pilot" ? "Pilot metadata set" : "Standard customer metadata"}</small></article>
    </section>
    <section className="workspace-panel"><div className="panel-title"><div><h2>Account setup</h2><p>Internal progress for admin-assisted setup.</p></div></div><div className="executive-activity">{checklist.map(([label, complete]) => <div key={label}><span aria-hidden="true">{complete ? "✓" : "○"}</span><p><strong>{label}</strong><small>{complete ? "Done" : "Pending"}</small></p></div>)}</div></section>
    <section className="workspace-panel"><div className="panel-title"><div><h2>Business information</h2><p>Internal admin-only setup details and owner metadata.</p></div></div><form action={updateAdminBusinessDetails} className="settings-grid">
      <input type="hidden" name="businessId" value={business.id} />
      <label>Business name<input name="businessName" defaultValue={business.name} /></label>
      <label>Industry<select name="industry" defaultValue={(business as any).industry_profile || ""}><option value="">Select an industry</option>{INDUSTRY_PROFILES.map(value => <option key={value} value={value}>{industryLabels[value] ?? value}</option>)}</select></label>
      <label>Business phone<input name="businessPhone" defaultValue={business.phone || ""} /></label>
      <label>Business email<input name="businessEmail" defaultValue={business.email || ""} /></label>
      <label>Website or domain<input name="websiteUrl" defaultValue={(business as any).website_url || ""} /></label>
      <label>City<input name="city" defaultValue={business.city || ""} /></label>
      <label>State<input name="state" defaultValue={business.state || ""} /></label>
      <label>ZIP<input name="postalCode" defaultValue={(business as any).postal_code || ""} /></label>
      <label>Service area<input name="serviceArea" defaultValue={setup?.service_area || ""} /></label>
      <label>Timezone<input name="timezone" defaultValue={business.timezone || "America/Phoenix"} /></label>
      <label>Customer type<select name="customerType" defaultValue={setup?.customer_type || "standard"}><option value="standard">Standard</option><option value="pilot">Pilot</option><option value="internal_test">Internal/Test</option></select></label>
      <label>Owner first name<input name="ownerFirstName" defaultValue={setup?.owner_first_name || ""} /></label>
      <label>Owner last name<input name="ownerLastName" defaultValue={setup?.owner_last_name || ""} /></label>
      <label>Owner email<input name="ownerEmail" type="email" defaultValue={setup?.owner_email || ""} /></label>
      <label>Owner phone<input name="ownerPhone" defaultValue={setup?.owner_phone || ""} /></label>
      <label className="settings-field-span">Internal admin notes<textarea name="internalAdminNotes" rows={5} defaultValue={setup?.internal_admin_notes || ""} /></label>
      <div className="crm-header-actions"><button className="sv-button">Save details</button>{setup?.last_activation_link && <a className="sv-button sv-secondary" href={setup.last_activation_link} target="_blank" rel="noreferrer">Copy activation link</a>}</div>
    </form></section>
    <section className="platform-admin-grid">
      <div className="platform-admin-grid-row"><span><strong>Services</strong><small>Create services and pricing in the existing workspace flow.</small></span><span><Link className="sv-button sv-secondary" href={`/app/${business.slug}/price-book`}>Open services</Link></span></div>
      <div className="platform-admin-grid-row"><span><strong>Website</strong><small>Reuse the existing website builder and settings.</small></span><span><Link className="sv-button sv-secondary" href={`/app/${business.slug}/settings/website`}>Open website</Link></span></div>
      <div className="platform-admin-grid-row"><span><strong>Booking settings</strong><small>Configure hours, availability, and booking behavior in the tenant workspace.</small></span><span><Link className="sv-button sv-secondary" href={`/app/${business.slug}/settings`}>Open settings</Link></span></div>
    </section>
  </main>;
}
