"use server";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {activatePhase3,syncPhase3} from "@/lib/twilio/phase3Activation";
import {requireBusinessTwilioEnabled} from "@/lib/twilio/access";
const value=(f:FormData,k:string)=>String(f.get(k)??"").trim();
async function adminUser(){const s=await createSupabaseServerClient(),{data:{user}}=await s.auth.getUser();if(!isServonasPlatformAdmin(user))throw new Error("Unauthorized");return user!;}
export async function activateTenant(formData:FormData){const user=await adminUser(),businessId=value(formData,"businessId");try{if(value(formData,"confirmation")!=="ACTIVATE"||formData.get("acknowledgeCharges")!=="on")throw new Error("Type ACTIVATE and acknowledge Twilio registration charges.");await requireBusinessTwilioEnabled(businessId);await activatePhase3(businessId,{description:value(formData,"description"),messageFlow:value(formData,"messageFlow"),messageSamples:[value(formData,"sample1"),value(formData,"sample2"),value(formData,"sample3")].filter(Boolean),useCase:value(formData,"useCase"),hasEmbeddedLinks:formData.get("hasEmbeddedLinks")==="on",hasEmbeddedPhone:formData.get("hasEmbeddedPhone")==="on"},user.id);redirect(`/app/admin/twilio?businessId=${businessId}&success=Activation requested`);}catch(error){redirect(`/app/admin/twilio?businessId=${businessId}&error=${encodeURIComponent(error instanceof Error?error.message:"Activation failed")}`);}}
export async function syncTenant(formData:FormData){const user=await adminUser(),businessId=value(formData,"businessId");try{await syncPhase3(businessId,user.id);redirect(`/app/admin/twilio?businessId=${businessId}&success=Status synchronized`);}catch{redirect(`/app/admin/twilio?businessId=${businessId}&error=Status synchronization failed`);}}
