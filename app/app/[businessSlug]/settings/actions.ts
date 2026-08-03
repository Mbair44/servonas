"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace,requireWorkspaceCapability } from "@/lib/workspace";
import { createStripeOnboardingLink,stripeClient,stripeConnectState,stripeProviderError,syncStripeConnectAccount } from "@/lib/stripeConnect";
import {validateEmployeeNumbering} from "@/lib/employeeNumbering";
import {hasIndustryCapability} from "@/lib/industryCapabilities";
import {poolChemistryFields} from "@/lib/poolService";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function updateBusinessSettings(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding"); if(!canManageBusiness(role)) redirect(`/app/${slug}/settings?error=Only+owners+and+admins+can+change+settings`);
 const payload={name:text(formData,"name"),email:text(formData,"email")||null,phone:text(formData,"phone")||null,timezone:text(formData,"timezone")||"America/Phoenix",primary_color:text(formData,"primaryColor")||"#2563eb",website_url:text(formData,"websiteUrl")||null,address_line1:text(formData,"addressLine1")||null,city:text(formData,"city")||null,state:text(formData,"state")||null,postal_code:text(formData,"postalCode")||null,tax_rate:Number(text(formData,"taxRate")||0),updated_by:user.id,updated_at:new Date().toISOString()};
 if(!payload.name) redirect(`/app/${slug}/settings?error=Business+name+is+required`);
 const {error}=await supabase.from("businesses").update(payload).eq("id",business.id); if(error) redirect(`/app/${slug}/settings?error=${encodeURIComponent(error.message)}`);
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/settings`); redirect(`/app/${slug}/settings?success=Settings+saved`);
}

export async function updateInboundSmsSettings(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"customer_management");
 const target=`/app/${slug}/settings/communications`;
 if(!canManageBusiness(role))redirect(`${target}?error=${encodeURIComponent("Only owners and admins can change inbound SMS settings.")}#inbound-sms`);
 const digits=text(formData,"inboundNumber").replace(/\D/g,"");
 const inboundNumber=digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith("1")?`+${digits}`:null;
 const autoReply=text(formData,"autoReply"),emergencyReply=text(formData,"emergencyReply");
 if(!inboundNumber||!autoReply||!emergencyReply)redirect(`${target}?error=${encodeURIComponent("Enter a valid U.S. SMS number and both reply messages.")}#inbound-sms`);
 const {error}=await supabase.from("business_inbound_sms_settings").upsert({business_id:business.id,enabled:formData.get("enabled")==="on",inbound_number_e164:inboundNumber,auto_reply_enabled:formData.get("autoReplyEnabled")==="on",auto_reply_body:autoReply,emergency_reply_body:emergencyReply,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"business_id"});
 if(error){console.error("Inbound SMS settings update failed",{businessId:business.id,code:error.code});redirect(`${target}?error=${encodeURIComponent(error.code==="23505"?"That inbound number is already assigned to another workspace.":"Inbound SMS settings could not be saved. Apply the latest database migration first.")}#inbound-sms`);}
 revalidatePath(`/app/${slug}/settings`);
 redirect(`${target}?success=${encodeURIComponent("Inbound SMS settings saved.")}#inbound-sms`);
}

export async function updateMissedCallRecoverySettings(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"customer_management");
 if(!canManageBusiness(role))redirect(`/app/${slug}/settings?error=${encodeURIComponent("Only owners and admins can change missed-call recovery settings.")}#missed-call-recovery`);
 const phone=(key:string)=>{const digits=text(formData,key).replace(/\D/g,"");return !digits?null:digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith("1")?`+${digits}`:null;};
 const recoveryNumber=phone("recoveryNumber"),alertPhone=phone("alertPhone"),initialSms=text(formData,"initialSms"),aiInstructions=text(formData,"aiInstructions");
 if(!recoveryNumber||!initialSms||!aiInstructions)redirect(`/app/${slug}/settings?error=${encodeURIComponent("Enter a valid recovery number, initial text, and AI instructions.")}#missed-call-recovery`);
 const {error}=await supabase.from("business_missed_call_settings").upsert({business_id:business.id,enabled:formData.get("enabled")==="on",recovery_number_e164:recoveryNumber,initial_sms_body:initialSms,ai_enabled:formData.get("aiEnabled")==="on",ai_instructions:aiInstructions,booking_enabled:formData.get("bookingEnabled")==="on",alert_phone_e164:alertPhone,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"business_id"});
 if(error){console.error("Missed-call settings update failed",{businessId:business.id,code:error.code});redirect(`/app/${slug}/settings?error=${encodeURIComponent(error.code==="42P01"||error.code==="PGRST205"?"Apply the missed-call recovery migration first.":"Missed-call recovery settings could not be saved.")}#missed-call-recovery`);}
 revalidatePath(`/app/${slug}/settings/communications`);redirect(`/app/${slug}/settings/communications?success=${encodeURIComponent("Missed-call recovery settings saved.")}#missed-call-recovery`);
}

export async function updatePoolServiceSettings(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role)||!hasIndustryCapability(business.industry_profile,"poolChemistryTracking"))redirect(`/app/${slug}/settings?error=${encodeURIComponent("Pool Service settings are available only to Pool Service owners and admins.")}#pool-service-settings`);
 const enabled=formData.getAll("chemistryFields").map(String).filter(key=>poolChemistryFields.some(([valid])=>valid===key));
 const number=(key:string,fallback:number)=>{const value=Number(text(formData,key));return Number.isFinite(value)?value:fallback};
 const {error}=await supabase.from("pool_service_settings").upsert({business_id:business.id,enabled_chemistry_fields:enabled,weather_alerts_enabled:formData.get("weatherEnabled")==="on",wind_threshold_mph:number("windThreshold",30),rain_threshold_inches:number("rainThreshold",1),heat_threshold_f:number("heatThreshold",110),freeze_threshold_f:number("freezeThreshold",32),updated_by:user.id},{onConflict:"business_id"});
 if(error)redirect(`/app/${slug}/settings?error=${encodeURIComponent(`Pool settings could not be saved (${error.code}).`)}#pool-service-settings`);
 const ranges=poolChemistryFields.map(([key])=>({business_id:business.id,field_key:key,minimum_value:text(formData,`${key}Min`)||null,maximum_value:text(formData,`${key}Max`)||null,consecutive_visits:Math.max(1,Math.min(10,number(`${key}Visits`,2)))}));
 const {error:rangeError}=await supabase.from("pool_chemistry_ranges").upsert(ranges,{onConflict:"business_id,field_key"});
 const lines=(key:string)=>[...new Set(text(formData,key).split(/\r?\n/).map(item=>item.trim()).filter(Boolean))].slice(0,100);
 const chemicals=lines("chemicals"),checklist=lines("checklist");
 await Promise.all([supabase.from("pool_chemical_catalog").update({active:false}).eq("business_id",business.id),supabase.from("pool_checklist_templates").update({active:false}).eq("business_id",business.id)]);
 const [{error:chemicalError},{error:checklistError}]=await Promise.all([
  chemicals.length?supabase.from("pool_chemical_catalog").upsert(chemicals.map((name,index)=>({business_id:business.id,name,active:true,sort_order:index})),{onConflict:"business_id,name"}):Promise.resolve({error:null}),
  checklist.length?supabase.from("pool_checklist_templates").upsert(checklist.map((label,index)=>({business_id:business.id,label,active:true,sort_order:index})),{onConflict:"business_id,label"}):Promise.resolve({error:null}),
 ]);
 if(rangeError||chemicalError||checklistError)redirect(`/app/${slug}/settings?error=${encodeURIComponent("Some Pool Service lists or ranges could not be saved.")}#pool-service-settings`);
 revalidatePath(`/app/${slug}/settings/pool-service`);redirect(`/app/${slug}/settings/pool-service?success=${encodeURIComponent("Pool Service settings saved.")}#pool-service-settings`);
}

export async function updateEmployeeNumbering(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(`/app/${slug}/settings?error=${encodeURIComponent("Only owners and admins can change employee numbering.")}#employee-numbering`);
 const value={autoAssignEnabled:formData.get("autoAssignEnabled")==="on",prefix:text(formData,"prefix"),startingNumber:Number(text(formData,"startingNumber")),nextNumber:Number(text(formData,"nextNumber")),minimumDigits:Number(text(formData,"minimumDigits")),allowManualOverride:formData.get("allowManualOverride")==="on"};
 const validationError=validateEmployeeNumbering(value);
 if(validationError)redirect(`/app/${slug}/settings?error=${encodeURIComponent(validationError)}#employee-numbering`);
 const {error}=await supabase.rpc("update_employee_numbering_settings",{p_business_id:business.id,p_auto_assign_enabled:value.autoAssignEnabled,p_prefix:value.prefix,p_starting_number:value.startingNumber,p_next_number:value.nextNumber,p_minimum_digits:value.minimumDigits,p_allow_manual_override:value.allowManualOverride});
 if(error){console.error("Employee numbering update failed",{businessId:business.id,code:error.code,message:error.message});const message=error.code==="23505"?"The next formatted employee number already belongs to an employee. Choose another next number.":error.code==="22023"?error.message:"Employee numbering settings could not be saved.";redirect(`/app/${slug}/settings?error=${encodeURIComponent(message)}#employee-numbering`);}
 revalidatePath(`/app/${slug}/settings`);revalidatePath(`/app/${slug}/team`);
 redirect(`/app/${slug}/settings/employees?success=${encodeURIComponent("Employee numbering settings saved.")}#employee-numbering`);
}

const coordinate=(formData:FormData,key:string)=>{
 const value=text(formData,key); if(!value)return null; const parsed=Number(value); return Number.isFinite(parsed)?parsed:NaN;
};
export async function updateRouteEndpoints(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"dispatch");
 if(!canManageBusiness(role))redirect(`/app/${slug}/settings?error=${encodeURIComponent("Only owners and admins can manage route endpoints.")}`);
 const technicianId=text(formData,"technicianId");
 const startMode=text(formData,"startMode"),endMode=text(formData,"endMode");
 const latitude=coordinate(formData,technicianId?"homeLatitude":"officeLatitude");
 const longitude=coordinate(formData,technicianId?"homeLongitude":"officeLongitude");
 if(Number.isNaN(latitude)||Number.isNaN(longitude)||(latitude===null)!==(longitude===null)){
  redirect(`/app/${slug}/settings?error=${encodeURIComponent("Enter a valid latitude and longitude pair.")}#route-endpoints`);
 }
 if(technicianId){
  const usesHome=startMode==="home"||endMode==="home";
  const customStartLatitude=coordinate(formData,"customStartLatitude"),customStartLongitude=coordinate(formData,"customStartLongitude");
  const customEndLatitude=coordinate(formData,"customEndLatitude"),customEndLongitude=coordinate(formData,"customEndLongitude");
  if((startMode==="custom"&&(!text(formData,"customStartAddress")||customStartLatitude===null||customStartLongitude===null||Number.isNaN(customStartLatitude)||Number.isNaN(customStartLongitude)))||(endMode==="custom"&&(!text(formData,"customEndAddress")||customEndLatitude===null||customEndLongitude===null||Number.isNaN(customEndLatitude)||Number.isNaN(customEndLongitude))))redirect(`/app/${slug}/settings?error=${encodeURIComponent("Custom endpoints require an address and verified coordinates.")}#route-endpoints`);
  const payload={
   business_id:business.id,technician_id:technicianId,start_mode:startMode||"inherit",end_mode:endMode||"inherit",
   home_label:text(formData,"homeLabel")||"Technician home",
   home_address:usesHome?text(formData,"homeAddress")||null:null,
   home_latitude:usesHome?latitude:null,home_longitude:usesHome?longitude:null,
   custom_start_label:startMode==="custom"?text(formData,"customStartLabel")||"Custom start":null,
   custom_start_address:startMode==="custom"?text(formData,"customStartAddress")||null:null,
   custom_start_latitude:startMode==="custom"?customStartLatitude:null,custom_start_longitude:startMode==="custom"?customStartLongitude:null,
   custom_end_label:endMode==="custom"?text(formData,"customEndLabel")||"Custom end":null,
   custom_end_address:endMode==="custom"?text(formData,"customEndAddress")||null:null,
   custom_end_latitude:endMode==="custom"?customEndLatitude:null,custom_end_longitude:endMode==="custom"?customEndLongitude:null,updated_by:user.id,
  };
  if(usesHome&&(!payload.home_address||latitude===null))redirect(`/app/${slug}/settings?error=${encodeURIComponent("A private home address and verified coordinates are required when routing from home.")}#route-endpoints`);
  const {error}=await supabase.from("technician_route_endpoint_overrides").upsert(payload,{onConflict:"business_id,technician_id"});
  if(error){console.error("Private technician endpoint update failed",{code:error.code,businessId:business.id,technicianId});redirect(`/app/${slug}/settings?error=${encodeURIComponent("Technician route endpoints could not be saved.")}#route-endpoints`);}
 }else{
  const usesOffice=startMode==="office"||endMode==="office";
  const customStartLatitude=coordinate(formData,"customStartLatitude"),customStartLongitude=coordinate(formData,"customStartLongitude");
  const customEndLatitude=coordinate(formData,"customEndLatitude"),customEndLongitude=coordinate(formData,"customEndLongitude");
  if((startMode==="custom"&&(!text(formData,"customStartAddress")||customStartLatitude===null||customStartLongitude===null||Number.isNaN(customStartLatitude)||Number.isNaN(customStartLongitude)))||(endMode==="custom"&&(!text(formData,"customEndAddress")||customEndLatitude===null||customEndLongitude===null||Number.isNaN(customEndLatitude)||Number.isNaN(customEndLongitude))))redirect(`/app/${slug}/settings?error=${encodeURIComponent("Custom endpoints require an address and verified coordinates.")}#route-endpoints`);
  const payload={business_id:business.id,start_mode:startMode||"first_job",end_mode:endMode||"last_job",
   office_label:text(formData,"officeLabel")||"Main office",office_address:usesOffice?text(formData,"officeAddress")||null:null,
   office_latitude:usesOffice?latitude:null,office_longitude:usesOffice?longitude:null,
   custom_start_label:startMode==="custom"?text(formData,"customStartLabel")||"Custom start":null,
   custom_start_address:startMode==="custom"?text(formData,"customStartAddress")||null:null,
   custom_start_latitude:startMode==="custom"?customStartLatitude:null,custom_start_longitude:startMode==="custom"?customStartLongitude:null,
   custom_end_label:endMode==="custom"?text(formData,"customEndLabel")||"Custom end":null,
   custom_end_address:endMode==="custom"?text(formData,"customEndAddress")||null:null,
   custom_end_latitude:endMode==="custom"?customEndLatitude:null,custom_end_longitude:endMode==="custom"?customEndLongitude:null,updated_by:user.id};
  if(usesOffice&&(!payload.office_address||latitude===null))redirect(`/app/${slug}/settings?error=${encodeURIComponent("An office address and verified coordinates are required when office routing is selected.")}#route-endpoints`);
  const {error}=await supabase.from("business_route_endpoint_defaults").upsert(payload,{onConflict:"business_id"});
  if(error){console.error("Business route endpoint update failed",{code:error.code,businessId:business.id});redirect(`/app/${slug}/settings?error=${encodeURIComponent("Business route defaults could not be saved.")}#route-endpoints`);}
 }
 revalidatePath(`/app/${slug}/settings`);revalidatePath(`/app/${slug}/dispatch`);
 redirect(`/app/${slug}/settings/operations?success=${encodeURIComponent("Route endpoints saved. Existing routes are marked stale.")}#route-endpoints`);
}
export async function updateRoutingPolicy(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"dispatch");
 if(!canManageBusiness(role))redirect(`/app/${slug}/settings?error=${encodeURIComponent("Only owners and admins can change routing policy.")}`);
 const defaultDuration=Number(text(formData,"defaultDuration")),lockMinutes=Number(text(formData,"lockMinutes"));
 if(!Number.isInteger(defaultDuration)||defaultDuration<1||defaultDuration>1440||!Number.isInteger(lockMinutes)||lockMinutes<0||lockMinutes>1440)redirect(`/app/${slug}/settings?error=${encodeURIComponent("Enter valid routing duration and lock-period values.")}#route-endpoints`);
 const {error}=await supabase.from("business_routing_policies").upsert({business_id:business.id,auto_dispatch_all_jobs:formData.get("autoDispatchAllJobs")==="on",default_service_duration_minutes:defaultDuration,imminent_job_lock_minutes:lockMinutes,scheduled_window_notifications_enabled:formData.get("scheduledWindowNotifications")==="on",en_route_notifications_enabled:formData.get("enRouteNotifications")==="on",proximity_eta_notifications_enabled:formData.get("proximityEtaNotifications")==="on",updated_by:user.id},{onConflict:"business_id"});
 if(error){console.error("Business routing policy update failed",{code:error.code,businessId:business.id});redirect(`/app/${slug}/settings?error=${encodeURIComponent("Routing policy could not be saved.")}#route-endpoints`);}
 revalidatePath(`/app/${slug}/settings`);revalidatePath(`/app/${slug}/dispatch`);
 redirect(`/app/${slug}/settings/operations?success=${encodeURIComponent("Routing policy saved.")}#route-endpoints`);
}

const stripeResult=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/settings/billing?${kind}=${encodeURIComponent(message)}#payments`;

export async function updateInvoicePaymentOptions(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(stripeResult(slug,"error","Only owners and admins can change payment options."));
 const acceptCheck=formData.get("acceptCheck")==="on",acceptPhone=formData.get("acceptPayByPhone")==="on";
 const checkPayableTo=text(formData,"checkPayableTo"),paymentPhone=text(formData,"paymentPhone");
 if(acceptCheck&&!checkPayableTo)redirect(stripeResult(slug,"error","Enter who checks should be payable to."));
 if(acceptPhone&&!paymentPhone)redirect(stripeResult(slug,"error","Enter a phone number for phone payments."));
 const {error}=await supabase.from("business_billing_settings").upsert({
  business_id:business.id,accept_online_card:formData.get("acceptOnlineCard")==="on",
  accept_cash:formData.get("acceptCash")==="on",accept_check:acceptCheck,accept_pay_by_phone:acceptPhone,
  check_payable_to:checkPayableTo||null,payment_phone:paymentPhone||null,updated_at:new Date().toISOString(),
 },{onConflict:"business_id"});
 if(error){console.error("Invoice payment options update failed",{businessId:business.id,code:error.code});redirect(stripeResult(slug,"error","Invoice payment options could not be saved."));}
 revalidatePath(`/app/${slug}/settings`);
 redirect(stripeResult(slug,"success","Invoice payment options saved."));
}

export async function connectStripe(slug:string){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"invoices");
 if(!canManageBusiness(role))redirect(stripeResult(slug,"error","Only owners and admins can connect Stripe"));
 let destination:string;
 try{
  const stripe=stripeClient();
  const {data:existing}=await supabase.from("business_payment_accounts").select("provider_account_id")
   .eq("business_id",business.id).eq("provider","stripe").maybeSingle();
  let accountId=existing?.provider_account_id;
  if(!accountId){
   const account=await stripe.accounts.create({
    type:"express",country:"US",email:business.email||undefined,
    capabilities:{card_payments:{requested:true},transfers:{requested:true}},
    business_profile:{name:business.name,url:business.website_url||undefined},
    metadata:{business_id:business.id,platform:"servonas"},
   });
   accountId=account.id;
   const state=stripeConnectState(account);
   const {error}=await supabase.from("business_payment_accounts").upsert({
    business_id:business.id,provider:"stripe",provider_account_id:account.id,account_type:"express",
    ...state,disconnected_at:null,
   },{onConflict:"business_id,provider"});
   if(error){
    try{await stripe.accounts.del(account.id);}catch(cleanupError){console.error("Stripe orphan cleanup failed",{businessId:business.id,accountId:account.id,error:stripeProviderError(cleanupError)});}
    throw new Error(`Connected account could not be saved (${error.code}).`);
   }
  }
  const link=await createStripeOnboardingLink(accountId,slug,stripe);
  destination=link.url;
 }catch(error){
  const detail=stripeProviderError(error);
  console.error("Stripe Connect start failed",{businessId:business.id,...detail});
  await supabase.from("business_payment_accounts").update({last_provider_error:detail.message,last_provider_sync_at:new Date().toISOString()}).eq("business_id",business.id).eq("provider","stripe");
  redirect(stripeResult(slug,"error",`Stripe connection failed: ${detail.message}`));
 }
 redirect(destination);
}

export async function refreshStripeStatus(slug:string){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"invoices");
 if(!canManageBusiness(role))redirect(stripeResult(slug,"error","Only owners and admins can refresh Stripe"));
 const {data:paymentAccount}=await supabase.from("business_payment_accounts").select("provider_account_id")
  .eq("business_id",business.id).eq("provider","stripe").maybeSingle();
 if(!paymentAccount?.provider_account_id)redirect(stripeResult(slug,"error","No Stripe account is connected"));
 let ready=false;
 try{
  const state=await syncStripeConnectAccount(supabase,business.id,paymentAccount.provider_account_id);
  ready=state.onboarding_status==="complete";
 }catch(error){
  const detail=stripeProviderError(error);
  console.error("Stripe Connect refresh failed",{businessId:business.id,accountId:paymentAccount.provider_account_id,...detail});
  await supabase.from("business_payment_accounts").update({last_provider_error:detail.message,last_provider_sync_at:new Date().toISOString()})
   .eq("business_id",business.id).eq("provider_account_id",paymentAccount.provider_account_id);
  redirect(stripeResult(slug,"error",`Stripe status refresh failed: ${detail.message}`));
 }
 redirect(stripeResult(slug,"success",ready?"Stripe is ready for payments":"Stripe status refreshed"));
}

export async function disconnectStripe(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"invoices");
 if(!canManageBusiness(role))redirect(stripeResult(slug,"error","Only owners and admins can disconnect Stripe"));
 if(text(formData,"confirmation")!=="DISCONNECT")redirect(stripeResult(slug,"error","Type DISCONNECT to confirm"));
 const {data:paymentAccount}=await supabase.from("business_payment_accounts").select("provider_account_id")
  .eq("business_id",business.id).eq("provider","stripe").maybeSingle();
 if(!paymentAccount?.provider_account_id)redirect(stripeResult(slug,"error","No Stripe account is connected"));
 try{
  const stripe=stripeClient();
  await stripe.accounts.del(paymentAccount.provider_account_id);
  const {error}=await supabase.from("business_payment_accounts").update({
   provider_account_id:null,onboarding_status:"disabled",charges_enabled:false,payouts_enabled:false,
   details_submitted:false,requirements_currently_due:[],requirements_eventually_due:[],
   requirements_past_due:[],disabled_reason:"disconnected_by_business",capabilities:{},
   disconnected_at:new Date().toISOString(),last_provider_sync_at:new Date().toISOString(),last_provider_error:null,
  }).eq("business_id",business.id).eq("provider","stripe").eq("provider_account_id",paymentAccount.provider_account_id);
  if(error)throw new Error(`Disconnected account state could not be saved (${error.code}).`);
 }catch(error){
  const detail=stripeProviderError(error);
  console.error("Stripe Connect disconnect failed",{businessId:business.id,accountId:paymentAccount.provider_account_id,...detail});
  redirect(stripeResult(slug,"error",`Stripe disconnect failed: ${detail.message}`));
 }
 redirect(stripeResult(slug,"success","Stripe disconnected"));
}
