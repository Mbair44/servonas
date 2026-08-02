"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageCustomers} from "@/lib/access";
import {requireWorkspaceCapability} from "@/lib/workspace";

export async function mergeSmsDuplicate(slug:string,formData:FormData){
 const {supabase,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/messages`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to merge customer contacts.")}`);
 const source=String(formData.get("sourceCustomerId")??""),destination=String(formData.get("targetCustomerId")??"");
 if(!source||!destination||source===destination)redirect(`${target}?error=${encodeURIComponent("Choose two different customer records.")}`);
 const {error}=await supabase.rpc("merge_duplicate_customer_contact",{p_source_customer_id:source,p_target_customer_id:destination});
 if(error){console.error("Customer contact merge failed",{code:error.code,message:error.message});redirect(`${target}?error=${encodeURIComponent(error.code==="55000"?"This duplicate has jobs, invoices, locations, or plans. It needs a reviewed data merge.":"The duplicate contact could not be merged.")}`);}
 revalidatePath(target);revalidatePath(`/app/${slug}/customers`);
 redirect(`${target}?success=${encodeURIComponent("Duplicate contact merged.")}`);
}

export async function verifySmsExtraction(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/messages`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to verify customer information.")}`);
 const messageId=String(formData.get("messageId")??"");
 const {data:message,error}=await supabase.from("inbound_sms_messages").update({extracted_data_verified:true}).eq("id",messageId).eq("business_id",business.id).select("customer_id,extracted_data").maybeSingle();
 if(error||!message)redirect(`${target}?error=${encodeURIComponent("The extracted information could not be verified.")}`);
 if(message.customer_id)await supabase.from("customers").update({intake_data:message.extracted_data,intake_data_verified:true}).eq("id",message.customer_id).eq("business_id",business.id);
 revalidatePath(target);redirect(`${target}?success=${encodeURIComponent("Extracted customer information marked verified.")}`);
}

export async function updateMissedCallLeadStatus(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/messages`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to update leads.")}`);
 const leadId=String(formData.get("leadId")??""),status=String(formData.get("leadStatus")??"");
 if(!["new","contacted","qualified","booked","lost"].includes(status))redirect(`${target}?error=${encodeURIComponent("Choose a valid lead status.")}`);
 const {error}=await supabase.from("missed_call_recovery_leads").update({lead_status:status,conversation_status:status==="booked"?"booked":status==="lost"?"closed":"active"}).eq("business_id",business.id).eq("id",leadId);
 if(error)redirect(`${target}?error=${encodeURIComponent("The lead status could not be updated.")}`);
 revalidatePath(target);redirect(`${target}?success=${encodeURIComponent("Lead status updated.")}`);
}
