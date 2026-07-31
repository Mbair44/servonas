"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {stripeClient} from "@/lib/stripeConnect";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
const value=(formData:FormData,key:string)=>String(formData.get(key)??"").trim();
export async function manageEntitlement(formData:FormData){
 const supabase=await createSupabaseServerClient(),{data:{user}}=await supabase.auth.getUser();
 if(!isServonasPlatformAdmin(user))redirect("/app");
 if(value(formData,"confirmation")!=="CONFIRM")redirect("/app/admin/entitlements?error="+encodeURIComponent("Type CONFIRM before applying an access change."));
 const action=value(formData,"action"),ends=value(formData,"endsAt");
 const {error}=action==="grant_pilot"?await supabase.rpc("grant_pilot_entitlement_admin",{p_business_id:value(formData,"businessId"),p_reason:value(formData,"reason")}):await supabase.rpc("manage_business_entitlement",{
  p_business_id:value(formData,"businessId"),p_entitlement_id:value(formData,"entitlementId"),
  p_expected_version:Number(value(formData,"version")),p_action:action,p_reason:value(formData,"reason"),
  p_ends_at:ends?new Date(`${ends}T23:59:59.999Z`).toISOString():null,
 });
 if(error){console.error("Internal entitlement command failed",{businessId:value(formData,"businessId"),entitlementId:value(formData,"entitlementId"),action,code:error.code});redirect("/app/admin/entitlements?error="+encodeURIComponent(error.code==="40001"?"Access changed. Refresh and try again.":"The entitlement change could not be applied."));}
 revalidatePath("/app/admin/entitlements");redirect("/app/admin/entitlements?success="+encodeURIComponent("Entitlement change applied and audited."));
}

export async function updateTrialPeriod(formData:FormData){
 const supabase=await createSupabaseServerClient(),{data:{user}}=await supabase.auth.getUser();
 if(!isServonasPlatformAdmin(user))redirect("/app");
 const back="/app/admin/trials",businessId=value(formData,"businessId"),entitlementId=value(formData,"entitlementId");
 if(value(formData,"confirmation")!=="CONFIRM")redirect(`${back}?error=${encodeURIComponent("Type CONFIRM before changing a trial date.")}`);
 const end=value(formData,"trialEndsAt"),reason=value(formData,"reason");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||reason.length<5)redirect(`${back}?error=${encodeURIComponent("Enter a valid future date and an administrative reason.")}`);
 const trialEnd=new Date(`${end}T23:59:59.999Z`);
 if(trialEnd.getTime()<=Date.now())redirect(`${back}?error=${encodeURIComponent("The trial end date must be in the future.")}`);
 const admin=getSupabaseAdmin();if(!admin)redirect(`${back}?error=${encodeURIComponent("Platform administration is unavailable.")}`);
 const {data:subscription}=await admin.from("business_platform_subscriptions").select("stripe_subscription_id,status").eq("business_id",businessId).maybeSingle();
 try{
  if(subscription?.stripe_subscription_id&&subscription.status==="trialing")await stripeClient().subscriptions.update(subscription.stripe_subscription_id,{trial_end:Math.floor(trialEnd.getTime()/1000)});
  const {error:entitlementError}=await supabase.rpc("manage_business_entitlement",{p_business_id:businessId,p_entitlement_id:entitlementId,p_expected_version:Number(value(formData,"version")),p_action:"change_end_date",p_reason:reason,p_ends_at:trialEnd.toISOString()});
  if(entitlementError)throw new Error(entitlementError.code==="40001"?"Access changed. Refresh and try again.":`Entitlement update failed (${entitlementError.code}).`);
  if(subscription){const {error}=await admin.from("business_platform_subscriptions").update({trial_ends_at:trialEnd.toISOString(),updated_at:new Date().toISOString()}).eq("business_id",businessId);if(error)throw new Error(`Subscription trial date could not be saved (${error.code}).`);}
 }catch(error){const message=error instanceof Error?error.message:"Trial date could not be changed.";console.error("Internal trial date update failed",{businessId,message});redirect(`${back}?error=${encodeURIComponent(message)}`);}
 revalidatePath(back);revalidatePath("/app");redirect(`${back}?success=${encodeURIComponent("Trial end date updated in Servonas and Stripe.")}`);
}
