"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {validateOnboardingCompany,type OnboardingCompanyInput} from "@/lib/onboardingCompany";

export type OnboardingState={error?:string;fieldErrors?:Partial<Record<keyof OnboardingCompanyInput,string>>;values?:Partial<OnboardingCompanyInput>};
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function createWorkspace(_:OnboardingState,formData:FormData):Promise<OnboardingState>{
  const s=await createSupabaseServerClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect("/login?next=/onboarding");
  const name=text(formData,"name"), slug=text(formData,"slug").toLowerCase(), email=text(formData,"email")||user.email||"";
  const businessModel=text(formData,"model")||"services";
  const modules=["booking","customers"];
  if(formData.get("inventory")==="on") modules.push("inventory");
  if(formData.get("staff")==="on") modules.push("team");
  if(formData.get("deposits")==="on") modules.push("payments");
  if(name.length<2||!slug.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) return {error:"Enter a business name and a valid workspace URL."};
  const {data,error}=await s.rpc("create_business_workspace",{p_name:name,p_slug:slug,p_email:email,p_business_model:businessModel,p_primary_color:text(formData,"color")||"#2563eb",p_enabled_modules:modules});
  if(error) return {error:error.message.includes("duplicate")?"That workspace URL is already taken.":error.message};
  const created=Array.isArray(data)?data[0]:data;
  redirect(`/app/${created?.slug??slug}?created=1`);
}
export async function createGuidedWorkspace(_:OnboardingState,formData:FormData):Promise<OnboardingState>{
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login?next=/onboarding");
 const values:OnboardingCompanyInput={name:text(formData,"name"),displayName:text(formData,"displayName"),slug:text(formData,"slug").toLowerCase(),
  addressLine1:text(formData,"addressLine1"),addressLine2:text(formData,"addressLine2"),city:text(formData,"city"),region:text(formData,"region"),
  postalCode:text(formData,"postalCode"),country:text(formData,"country")||"US",phone:text(formData,"phone"),email:text(formData,"email"),
  website:text(formData,"website"),timezone:text(formData,"timezone")};
 const fieldErrors=validateOnboardingCompany(values);
 if(Object.keys(fieldErrors).length)return {error:"Review the highlighted company information.",fieldErrors,values};
 const {data,error}=await s.rpc("create_guided_business_workspace",{p_name:values.name,p_display_name:values.displayName,p_slug:values.slug,
  p_email:values.email,p_phone:values.phone,p_website_url:values.website||null,p_address_line1:values.addressLine1,p_address_line2:values.addressLine2||null,
  p_city:values.city,p_state:values.region,p_postal_code:values.postalCode,p_country:values.country,p_timezone:values.timezone});
 if(error){console.error("Guided workspace creation failed",{provider:"supabase",operation:"create_guided_business_workspace",code:error.code,message:error.message,userId:user.id});
  return {error:error.code==="23505"?"That workspace URL is already taken.":"Your company could not be saved. Please review the information and try again.",values};}
 const created=Array.isArray(data)?data[0]:data;redirect(`/onboarding?business=${encodeURIComponent(created?.slug??values.slug)}&saved=company`);
}
