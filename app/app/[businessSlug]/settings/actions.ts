"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { createStripeOnboardingLink,stripeClient,stripeConnectState,stripeProviderError,syncStripeConnectAccount } from "@/lib/stripeConnect";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function updateBusinessSettings(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug); if(!canManageBusiness(role)) redirect(`/app/${slug}/settings?error=Only+owners+and+admins+can+change+settings`);
 const payload={name:text(formData,"name"),email:text(formData,"email")||null,phone:text(formData,"phone")||null,timezone:text(formData,"timezone")||"America/Phoenix",primary_color:text(formData,"primaryColor")||"#2563eb",website_url:text(formData,"websiteUrl")||null,address_line1:text(formData,"addressLine1")||null,city:text(formData,"city")||null,state:text(formData,"state")||null,postal_code:text(formData,"postalCode")||null,tax_rate:Number(text(formData,"taxRate")||0),updated_by:user.id,updated_at:new Date().toISOString()};
 if(!payload.name) redirect(`/app/${slug}/settings?error=Business+name+is+required`);
 const {error}=await supabase.from("businesses").update(payload).eq("id",business.id); if(error) redirect(`/app/${slug}/settings?error=${encodeURIComponent(error.message)}`);
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/settings`); redirect(`/app/${slug}/settings?success=Settings+saved`);
}

const coordinate=(formData:FormData,key:string)=>{
 const value=text(formData,key); if(!value)return null; const parsed=Number(value); return Number.isFinite(parsed)?parsed:NaN;
};
export async function updateRouteEndpoints(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
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
 redirect(`/app/${slug}/settings?success=${encodeURIComponent("Route endpoints saved. Existing routes are marked stale.")}#route-endpoints`);
}

const stripeResult=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/settings?${kind}=${encodeURIComponent(message)}#payments`;

export async function connectStripe(slug:string){
 const {supabase,business,role}=await requireWorkspace(slug);
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
 const {supabase,business,role}=await requireWorkspace(slug);
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
 const {supabase,business,role}=await requireWorkspace(slug);
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
