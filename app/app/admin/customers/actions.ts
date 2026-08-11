"use server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
export async function toggleCustomerFeatureAccess(input:{businessId:string;feature:"ai"|"twilio";enabled:boolean}){
 const session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!isServonasPlatformAdmin(user))return{ok:false,error:"Platform administrator access is required."};
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.businessId)||(input.feature!=="ai"&&input.feature!=="twilio"))return{ok:false,error:"That access setting is invalid."};
 const admin=getSupabaseAdmin();if(!admin)return{ok:false,error:"Platform administration is unavailable."};
 const rpc=input.feature==="ai"?"admin_set_business_ai_assistant_access":"admin_set_business_twilio_access",{error}=await admin.rpc(rpc,{p_business_id:input.businessId,p_enabled:input.enabled,p_changed_by:user!.id,p_reason:"Changed from customer access dashboard"});
 if(error){console.error("Customer feature access toggle failed",{businessId:input.businessId,feature:input.feature,code:error.code});return{ok:false,error:"Access could not be changed. Apply the latest migrations and try again."};}
 revalidatePath("/app/admin/customers");revalidatePath("/app/admin/usage");revalidatePath("/app");return{ok:true};
}
