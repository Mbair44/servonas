import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export async function isBusinessAssistantEnabled(businessId:string){
 const admin=getSupabaseAdmin();
 if(!admin)return false;
 const {data,error}=await admin.from("business_ai_assistant_access").select("enabled").eq("business_id",businessId).maybeSingle();
 if(error){console.error("AI Assistant access check failed",{businessId,code:error.code});return false;}
 return data?.enabled===true;
}

export const assistantDisabledMessage="Servonas AI Assistant is not enabled for this workspace.";
