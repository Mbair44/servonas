"use server";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {sendPilotSms} from "@/lib/twilio/testSms";
export async function sendTestSms(form:FormData){
 const session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!isServonasPlatformAdmin(user))throw new Error("Unauthorized");
 let error:string|null=null;
 try{await sendPilotSms({requestKey:String(form.get("requestKey")??""),to:String(form.get("to")??"").trim(),consent:form.get("consent")==="on"},user!.id);}catch(caught){error=caught instanceof Error?caught.message:"Test could not be sent.";}
 redirect(`/app/admin/twilio${error?`?error=${encodeURIComponent(error)}`:""}`);
}
