import { WorkspaceNav } from "../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { defaultEmployeeNumbering } from "@/lib/employeeNumbering";
import { stripePaymentsReady } from "@/lib/stripeConnect";
import { SettingsDashboard } from "@/components/SettingsDashboard";
import { connectStripe, disconnectStripe, refreshStripeStatus, updateBusinessSettings, updateEmployeeNumbering, updateInboundSmsSettings, updateInvoicePaymentOptions, updateMissedCallRecoverySettings, updatePoolServiceSettings, updateRouteEndpoints, updateRoutingPolicy } from "./actions";
import {MissedCallRecoverySettings} from "@/components/MissedCallRecoverySettings";
import {PoolServiceSettings} from "@/components/PoolServiceSettings";
import {hasIndustryCapability} from "@/lib/industryCapabilities";
import {defaultPoolChemicals,defaultPoolChecklist} from "@/lib/poolService";
import type {SettingsSection} from "@/lib/settingsSections";
import {notFound} from "next/navigation";

export async function SettingsContent({businessSlug,q,section}:{businessSlug:string;q:Record<string,string|undefined>;section:SettingsSection}){
 const {supabase,business,role,entitlementSummary}=await requireWorkspace(businessSlug);
 const editable=canManageBusiness(role);
 const isPool=hasIndustryCapability(business.industry_profile,"poolServiceLogs");
 if(section==="pool-service"&&!isPool)notFound();
 const [{data:paymentAccount,error:paymentAccountError},{data:endpointDefaults},{data:technicians},{data:endpointOverrides},{data:routingPolicy},{data:numbering},{data:invoicePaymentOptions},{data:inboundSmsSettings},{data:missedCallSettings},{data:poolSettings},{data:poolRanges},{data:poolChemicals},{data:poolChecklist}]=await Promise.all([
  supabase.from("business_payment_accounts").select("provider_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted,requirements_currently_due,requirements_eventually_due,requirements_past_due,disabled_reason,last_provider_sync_at,last_provider_error,disconnected_at").eq("business_id",business.id).eq("provider","stripe").maybeSingle(),
  editable?supabase.from("business_route_endpoint_defaults").select("*").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  editable?supabase.from("technician_directory").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).order("preferred_name"):Promise.resolve({data:[]}),
  editable?supabase.from("technician_route_endpoint_overrides").select("*").eq("business_id",business.id):Promise.resolve({data:[]}),
  editable?supabase.from("business_routing_policies").select("default_service_duration_minutes,imminent_job_lock_minutes,scheduled_window_notifications_enabled,en_route_notifications_enabled,proximity_eta_notifications_enabled,auto_dispatch_all_jobs").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  supabase.from("employee_numbering_settings").select("auto_assign_enabled,prefix,starting_number,next_number,minimum_digits,allow_manual_override").eq("business_id",business.id).maybeSingle(),
  supabase.from("business_billing_settings").select("accept_online_card,accept_cash,accept_check,accept_pay_by_phone,check_payable_to,payment_phone").eq("business_id",business.id).maybeSingle(),
  supabase.from("business_inbound_sms_settings").select("enabled,inbound_number_e164,auto_reply_enabled,auto_reply_body,emergency_reply_body").eq("business_id",business.id).maybeSingle(),
  supabase.from("business_missed_call_settings").select("enabled,recovery_number_e164,initial_sms_body,ai_enabled,ai_instructions,booking_enabled,alert_phone_e164").eq("business_id",business.id).maybeSingle(),
  isPool?supabase.from("pool_service_settings").select("enabled_chemistry_fields,weather_alerts_enabled,wind_threshold_mph,rain_threshold_inches,heat_threshold_f,freeze_threshold_f").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  isPool?supabase.from("pool_chemistry_ranges").select("field_key,minimum_value,maximum_value,consecutive_visits").eq("business_id",business.id):Promise.resolve({data:[]}),
  isPool?supabase.from("pool_chemical_catalog").select("name").eq("business_id",business.id).eq("active",true).order("sort_order"):Promise.resolve({data:[]}),
  isPool?supabase.from("pool_checklist_templates").select("label").eq("business_id",business.id).eq("active",true).order("sort_order"):Promise.resolve({data:[]}),
 ]);
 const employeeNumbering=numbering?{
  autoAssignEnabled:numbering.auto_assign_enabled,prefix:numbering.prefix,startingNumber:Number(numbering.starting_number),
  nextNumber:Number(numbering.next_number),minimumDigits:Number(numbering.minimum_digits),allowManualOverride:numbering.allow_manual_override,
 }:defaultEmployeeNumbering;
 const restrictions=[...(paymentAccount?.requirements_past_due??[]),...(paymentAccount?.requirements_currently_due??[])];
 const payment={...paymentAccount,ready:Boolean(paymentAccount?.provider_account_id&&stripePaymentsReady(paymentAccount)),restrictions,error:Boolean(paymentAccountError)};
 const entitlement={
  name:entitlementSummary.name??"Access unavailable",status:entitlementSummary.effectiveStatus??"inactive",
  key:entitlementSummary.entitlement?.entitlement_key??null,startsAt:entitlementSummary.entitlement?.starts_at??null,
  endsAt:entitlementSummary.entitlement?.ends_at??null,capabilities:entitlementSummary.capabilities,
 };
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} poolService={isPool}/><section className="epic3-content settings-page-redesign">
  {q.error&&<div className="workspace-notice error">{q.error}</div>}{q.success&&<div className="workspace-notice success">{q.success}</div>}
  {section!=="communications"&&section!=="pool-service"&&<SettingsDashboard section={section}
   business={business} timezone={business.timezone} editable={editable} entitlement={entitlement}
   endpointDefaults={endpointDefaults} technicians={technicians??[]} endpointOverrides={endpointOverrides??[]}
   routingPolicy={routingPolicy} numbering={employeeNumbering} payment={payment} invoicePaymentOptions={invoicePaymentOptions}
   businessAction={updateBusinessSettings.bind(null,businessSlug)}
   routingAction={updateRoutingPolicy.bind(null,businessSlug)}
   endpointAction={updateRouteEndpoints.bind(null,businessSlug)}
   numberingAction={updateEmployeeNumbering.bind(null,businessSlug)}
   connectStripeAction={connectStripe.bind(null,businessSlug)}
   refreshStripeAction={refreshStripeStatus.bind(null,businessSlug)}
   disconnectStripeAction={disconnectStripe.bind(null,businessSlug)}
   invoicePaymentOptionsAction={updateInvoicePaymentOptions.bind(null,businessSlug)}
  />}
  {section==="communications"&&<header className="settings-page-header"><span>Workspace configuration</span><h1>Communication settings</h1><p>Manage inbound messages, automatic responses, and missed-call recovery.</p></header>}
  {editable&&section==="communications"&&<section className="settings-summary-card" id="inbound-sms"><header className="settings-section-header"><div><span>Customer communications</span><h2>Inbound text messages</h2><p>Turn texts to a designated Twilio number into matched customer conversations and optional automatic replies.</p></div></header><form action={updateInboundSmsSettings.bind(null,businessSlug)} className="settings-drawer-form single"><label className="settings-check wide"><input name="enabled" type="checkbox" defaultChecked={inboundSmsSettings?.enabled}/>Enable inbound SMS intake</label><label className="wide">Designated Twilio phone number<input required name="inboundNumber" type="tel" defaultValue={inboundSmsSettings?.inbound_number_e164??process.env.TWILIO_PHONE_NUMBER??""} placeholder="+14805550123"/></label><label className="settings-check wide"><input name="autoReplyEnabled" type="checkbox" defaultChecked={inboundSmsSettings?.auto_reply_enabled??true}/>Send an automatic acknowledgment</label><label className="wide">Automatic reply<textarea required name="autoReply" maxLength={1200} defaultValue={inboundSmsSettings?.auto_reply_body??"Thanks for contacting us. We received your message and a team member will follow up shortly. Reply STOP to opt out."}/></label><label className="wide">Urgent-message reply<textarea required name="emergencyReply" maxLength={1200} defaultValue={inboundSmsSettings?.emergency_reply_body??"We received your urgent message. If anyone is in immediate danger, call 911. A team member has been alerted."}/></label><p className="wide">Configure Twilio’s incoming-message webhook as <code>{`${process.env.NEXT_PUBLIC_APP_URL??"https://your-domain.com"}/api/twilio/inbound`}</code>. STOP messages are recorded and never receive an automated Servonas reply.</p><button className="sv-button">Save inbound SMS settings</button></form></section>}
  {editable&&section==="communications"&&<MissedCallRecoverySettings settings={missedCallSettings} defaultPhone={process.env.TWILIO_PHONE_NUMBER??""} baseUrl={process.env.NEXT_PUBLIC_APP_URL??"https://your-domain.com"} action={updateMissedCallRecoverySettings.bind(null,businessSlug)}/>}
  {section==="pool-service"&&isPool&&<header className="settings-page-header"><span>Industry settings</span><h1>Pool Service settings</h1><p>Configure chemistry, service logs, health ranges, chemicals, checklists, and weather alerts.</p></header>}
  {editable&&section==="pool-service"&&isPool&&<PoolServiceSettings settings={poolSettings} ranges={poolRanges??[]} chemicals={poolChemicals?.length?poolChemicals.map(item=>item.name):defaultPoolChemicals} checklist={poolChecklist?.length?poolChecklist.map(item=>item.label):defaultPoolChecklist} action={updatePoolServiceSettings.bind(null,businessSlug)}/>}
 </section></main>;
}
