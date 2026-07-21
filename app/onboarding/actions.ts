"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export type OnboardingState={error?:string};
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
