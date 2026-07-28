"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
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
