import {redirect} from "next/navigation";
import {requireWorkspace} from "@/lib/workspace";

export default async function CurrentEmployeeProfile({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 const {supabase,user,business}=await requireWorkspace(businessSlug);
 const {data:employee}=await supabase.from("employees").select("id").eq("business_id",business.id).eq("auth_user_id",user.id).maybeSingle();
 if(employee)redirect(`/app/${businessSlug}/team/${employee.id}`);
 redirect(`/app/${businessSlug}/team?error=${encodeURIComponent("Your login is not connected to an employee record yet.")}`);
}
