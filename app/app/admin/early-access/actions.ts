"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminSession } from "@/lib/adminBusinessSetup";
import { EARLY_ACCESS_STATUSES } from "@/lib/earlyAccess";

const text=(form:FormData,key:string,max:number)=>String(form.get(key)??"").trim().slice(0,max);
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);

export async function updateEarlyAccessLead(formData:FormData){
 const {admin}=await requirePlatformAdminSession(),id=text(formData,"id",64),status=text(formData,"status",32),notes=text(formData,"internalNotes",5000),lastContacted=text(formData,"lastContactedAt",40);
 if(!uuid(id)||!EARLY_ACCESS_STATUSES.includes(status as typeof EARLY_ACCESS_STATUSES[number]))throw new Error("Invalid lead update.");
 const patch:{status:string;internal_notes:string;last_contacted_at:string|null;updated_at:string}={status,internal_notes:notes,last_contacted_at:lastContacted?new Date(lastContacted).toISOString():null,updated_at:new Date().toISOString()};
 if(lastContacted&&Number.isNaN(new Date(lastContacted).getTime()))throw new Error("Invalid contact date.");
 const {error}=await admin.from("platform_early_access_leads").update(patch).eq("id",id);
 if(error)throw new Error("Lead could not be updated.");
 revalidatePath("/app/admin/early-access");
}
