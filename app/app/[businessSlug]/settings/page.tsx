import { WorkspaceNav } from "../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { defaultEmployeeNumbering } from "@/lib/employeeNumbering";
import { stripePaymentsReady } from "@/lib/stripeConnect";
import { SettingsDashboard } from "@/components/SettingsDashboard";
import { connectStripe, disconnectStripe, refreshStripeStatus, updateBusinessSettings, updateEmployeeNumbering, updateInvoicePaymentOptions, updateRouteEndpoints, updateRoutingPolicy } from "./actions";
import {startServonasSubscription} from "@/app/onboarding/actions";
import {formatTrialDate,platformBillingEnabled} from "@/lib/platformBilling";

export default async function Settings({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams;
 const {supabase,business,role,entitlementSummary}=await requireWorkspace(businessSlug);
 const editable=canManageBusiness(role);
 const subscriptionBillingEnabled=platformBillingEnabled();
 const [{data:paymentAccount,error:paymentAccountError},{data:endpointDefaults},{data:technicians},{data:endpointOverrides},{data:routingPolicy},{data:numbering},{data:platformSubscription},{data:invoicePaymentOptions}]=await Promise.all([
  supabase.from("business_payment_accounts").select("provider_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted,requirements_currently_due,requirements_eventually_due,requirements_past_due,disabled_reason,last_provider_sync_at,last_provider_error,disconnected_at").eq("business_id",business.id).eq("provider","stripe").maybeSingle(),
  editable?supabase.from("business_route_endpoint_defaults").select("*").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  editable?supabase.from("technician_directory").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).order("preferred_name"):Promise.resolve({data:[]}),
  editable?supabase.from("technician_route_endpoint_overrides").select("*").eq("business_id",business.id):Promise.resolve({data:[]}),
  editable?supabase.from("business_routing_policies").select("default_service_duration_minutes,imminent_job_lock_minutes,scheduled_window_notifications_enabled,en_route_notifications_enabled,proximity_eta_notifications_enabled").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  supabase.from("employee_numbering_settings").select("auto_assign_enabled,prefix,starting_number,next_number,minimum_digits,allow_manual_override").eq("business_id",business.id).maybeSingle(),
  subscriptionBillingEnabled?supabase.from("business_platform_subscriptions").select("status,trial_ends_at,current_period_ends_at").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  supabase.from("business_billing_settings").select("accept_online_card,accept_cash,accept_check,accept_pay_by_phone,check_payable_to,payment_phone").eq("business_id",business.id).maybeSingle(),
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
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content settings-page-redesign">
  {q.error&&<div className="workspace-notice error">{q.error}</div>}{q.success&&<div className="workspace-notice success">{q.success}</div>}
  <SettingsDashboard
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
  />
  {subscriptionBillingEnabled&&editable&&<section className="settings-summary-card" id="servonas-subscription"><header className="settings-section-header"><div><span>Servonas billing</span><h2>Software subscription</h2><p>This pays for your Servonas software access and is separate from Stripe Connect customer payments.</p></div></header><div className="settings-payment-summary"><div><b>{platformSubscription?.status==="active"||platformSubscription?.status==="trialing"?"Billing configured":"Payment method needed"}</b><span className={`estimate-status ${platformSubscription?.status==="active"?"paid":"draft"}`}>{platformSubscription?.status?.replaceAll("_"," ")??"not added"}</span></div><p>{platformSubscription?.trial_ends_at?`Your free trial ends ${formatTrialDate(platformSubscription.trial_ends_at,business.timezone)}.`:"Your first 30 days are free. Add billing before the trial deadline to prevent the workspace from being locked."}</p>{!["active","trialing"].includes(platformSubscription?.status??"")&&<form action={startServonasSubscription.bind(null,businessSlug,"settings")}><button className="sv-button">Add Servonas billing</button></form>}</div></section>}
 </section></main>;
}
