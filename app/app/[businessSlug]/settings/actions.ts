"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function updateBusinessSettings(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug); if(!canManageBusiness(role)) redirect(`/app/${slug}/settings?error=Only+owners+and+admins+can+change+settings`);
 const payload={name:text(formData,"name"),email:text(formData,"email")||null,phone:text(formData,"phone")||null,timezone:text(formData,"timezone")||"America/Phoenix",primary_color:text(formData,"primaryColor")||"#2563eb",website_url:text(formData,"websiteUrl")||null,address_line1:text(formData,"addressLine1")||null,city:text(formData,"city")||null,state:text(formData,"state")||null,postal_code:text(formData,"postalCode")||null,tax_rate:Number(text(formData,"taxRate")||0),updated_by:user.id,updated_at:new Date().toISOString()};
 if(!payload.name) redirect(`/app/${slug}/settings?error=Business+name+is+required`);
 const {error}=await supabase.from("businesses").update(payload).eq("id",business.id); if(error) redirect(`/app/${slug}/settings?error=${encodeURIComponent(error.message)}`);
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/settings`); redirect(`/app/${slug}/settings?success=Settings+saved`);
}
