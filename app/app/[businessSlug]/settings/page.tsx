import { WorkspaceNav } from "../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { defaultEmployeeNumbering } from "@/lib/employeeNumbering";
import { stripePaymentsReady } from "@/lib/stripeConnect";
import { SettingsDashboard } from "@/components/SettingsDashboard";
import { connectStripe, disconnectStripe, refreshStripeStatus, updateBusinessSettings, updateEmployeeNumbering, updateRouteEndpoints, updateRoutingPolicy } from "./actions";

export default async function Settings({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams;
 const {supabase,business,role,entitlementSummary}=await requireWorkspace(businessSlug);
 const editable=canManageBusiness(role);
 const [{data:paymentAccount,error:paymentAccountError},{data:endpointDefaults},{data:technicians},{data:endpointOverrides},{data:routingPolicy},{data:numbering}]=await Promise.all([
  supabase.from("business_payment_accounts").select("provider_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted,requirements_currently_due,requirements_eventually_due,requirements_past_due,disabled_reason,last_provider_sync_at,last_provider_error,disconnected_at").eq("business_id",business.id).eq("provider","stripe").maybeSingle(),
  editable?supabase.from("business_route_endpoint_defaults").select("*").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  editable?supabase.from("technician_directory").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).order("preferred_name"):Promise.resolve({data:[]}),
  editable?supabase.from("technician_route_endpoint_overrides").select("*").eq("business_id",business.id):Promise.resolve({data:[]}),
  editable?supabase.from("business_routing_policies").select("default_service_duration_minutes,imminent_job_lock_minutes,scheduled_window_notifications_enabled,en_route_notifications_enabled,proximity_eta_notifications_enabled").eq("business_id",business.id).maybeSingle():Promise.resolve({data:null}),
  supabase.from("employee_numbering_settings").select("auto_assign_enabled,prefix,starting_number,next_number,minimum_digits,allow_manual_override").eq("business_id",business.id).maybeSingle(),
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
   routingPolicy={routingPolicy} numbering={employeeNumbering} payment={payment}
   businessAction={updateBusinessSettings.bind(null,businessSlug)}
   routingAction={updateRoutingPolicy.bind(null,businessSlug)}
   endpointAction={updateRouteEndpoints.bind(null,businessSlug)}
   numberingAction={updateEmployeeNumbering.bind(null,businessSlug)}
   connectStripeAction={connectStripe.bind(null,businessSlug)}
   refreshStripeAction={refreshStripeStatus.bind(null,businessSlug)}
   disconnectStripeAction={disconnectStripe.bind(null,businessSlug)}
  />
 </section></main>;
}
