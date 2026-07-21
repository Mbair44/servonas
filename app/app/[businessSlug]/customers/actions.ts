"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function createCustomer(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug); if(!canManageCustomers(role)) redirect(`/app/${slug}/customers?error=Permission+denied`);
 const first=text(formData,"firstName"),last=text(formData,"lastName"),email=text(formData,"email").toLowerCase(),phone=text(formData,"phone"),notes=text(formData,"notes");
 if(!first) redirect(`/app/${slug}/customers?error=First+name+is+required`);
 const {error}=await supabase.from("customers").insert({business_id:business.id,first_name:first,last_name:last,email:email||null,phone:phone||null,notes:notes||null,created_by:user.id,updated_by:user.id});
 if(error) redirect(`/app/${slug}/customers?error=${encodeURIComponent(error.message)}`);
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/customers`); redirect(`/app/${slug}/customers?success=Customer+added`);
}
export async function archiveCustomer(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug); if(!canManageCustomers(role)) redirect(`/app/${slug}/customers?error=Permission+denied`);
 const id=text(formData,"customerId"); await supabase.from("customers").update({is_deleted:true,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",id).eq("business_id",business.id);
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/customers`);
}
