"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";

const value=(formData:FormData,key:string)=>String(formData.get(key)??"").trim();

export async function setAssistantAccess(formData:FormData){
 const session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!isServonasPlatformAdmin(user))redirect("/app");
 const businessId=value(formData,"businessId"),enabled=value(formData,"enabled")==="true",back="/app/admin/ai";
 if(value(formData,"confirmation")!=="CONFIRM")redirect(`${back}?error=${encodeURIComponent("Type CONFIRM before changing AI access.")}`);
 const reason=value(formData,"reason");
 if(reason.length<5)redirect(`${back}?error=${encodeURIComponent("Enter an internal reason with at least five characters.")}`);
 const admin=getSupabaseAdmin();if(!admin)redirect(`${back}?error=${encodeURIComponent("Platform administration is unavailable.")}`);
 const {error}=await admin.rpc("admin_set_business_ai_assistant_access",{p_business_id:businessId,p_enabled:enabled,p_changed_by:user!.id,p_reason:reason});
 if(error){console.error("AI access change failed",{businessId,code:error.code});redirect(`${back}?error=${encodeURIComponent(error.code==="PGRST202"?"Apply the latest AI access migration before using this control.":"AI access could not be changed.")}`);}
 revalidatePath(back);revalidatePath("/app");
 redirect(`${back}?success=${encodeURIComponent(enabled?"AI Assistant enabled for this business.":"AI Assistant disabled for this business.")}`);
}
