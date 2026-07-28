"use server";
import {createHash,randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {CustomerImportFileError,parseCustomerImportFile} from "@/lib/customerImport/file";

const base=(slug:string)=>`/app/${slug}/customers/imports`;
const safeMessage=(error:unknown)=>error instanceof CustomerImportFileError?error.message:"The file could not be inspected. Check the format and try again.";
export async function uploadCustomerImport(businessSlug:string,formData:FormData){
 const {supabase,business,user,role}=await requireWorkspace(businessSlug);if(!canManageCustomers(role))redirect(`${base(businessSlug)}?error=${encodeURIComponent("You do not have permission to import customers.")}`);
 const file=formData.get("customer_file"),importType=String(formData.get("import_type")??"customer_list"),supplied=String(formData.get("request_key")??""),requestKey=/^[0-9a-f-]{36}$/i.test(supplied)?supplied:randomUUID();
 if(!(file instanceof File)||!file.size)redirect(`${base(businessSlug)}?error=${encodeURIComponent("Choose a CSV or Excel file to continue.")}`);
 try{
  const preview=await parseCustomerImportFile(file),bytes=Buffer.from(await file.arrayBuffer()),checksum=createHash("sha256").update(bytes).digest("hex");
  const {data:existing}=await supabase.from("customer_imports").select("id").eq("business_id",business.id).eq("request_key",requestKey).maybeSingle();if(existing?.id)redirect(`${base(businessSlug)}/${existing.id}`);
  const id=randomUUID(),storagePath=`${business.id}/${id}/source.${preview.extension}`;
  const {error:uploadError}=await supabase.storage.from("customer-imports").upload(storagePath,file,{contentType:file.type||undefined,upsert:false});if(uploadError)throw new Error(`storage:${uploadError.message}`);
  const needsWorksheet=preview.extension==="xlsx"&&!preview.worksheetName;
  const {error}=await supabase.from("customer_imports").insert({id,business_id:business.id,import_type:importType,file_name:file.name,file_extension:preview.extension,file_size_bytes:file.size,file_checksum:checksum,storage_path:storagePath,worksheet_name:preview.worksheetName,worksheets:preview.worksheets,source_columns:preview.sourceColumns,total_row_count:preview.rowCount,uploaded_by:user.id,request_key:requestKey,status:"uploaded",current_stage:needsWorksheet?"worksheet":"mapping"});
  if(error){await supabase.storage.from("customer-imports").remove([storagePath]);throw new Error(`database:${error.code}`);}
  await supabase.from("customer_import_events").insert({business_id:business.id,import_id:id,event_type:"migration_started",actor_user_id:user.id,metadata:{import_type:importType,file_extension:preview.extension,row_count:preview.rowCount,worksheet_selection_required:needsWorksheet}});
  redirect(`${base(businessSlug)}/${id}?success=${encodeURIComponent(needsWorksheet?"Choose the worksheet that contains your customer data.":`${preview.rowCount.toLocaleString()} rows are ready for column matching.`)}`);
 }catch(error){if(error instanceof Error&&error.message==="NEXT_REDIRECT")throw error;console.error("Customer import upload failed",{businessId:business.id,actorUserId:user.id,category:error instanceof CustomerImportFileError?error.category:"unexpected",code:error instanceof Error?error.message.split(":")[0]:"unknown"});redirect(`${base(businessSlug)}?error=${encodeURIComponent(safeMessage(error))}`);}
}
export async function selectCustomerImportWorksheet(businessSlug:string,importId:string,formData:FormData){
 const {supabase,business,user,role}=await requireWorkspace(businessSlug),target=`${base(businessSlug)}/${importId}`;if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to change this import.")}`);
 const worksheet=String(formData.get("worksheet")??"");
 const {data:session,error}=await supabase.from("customer_imports").select("file_name,storage_path,version").eq("business_id",business.id).eq("id",importId).maybeSingle();if(error||!session?.storage_path)redirect(`${target}?error=${encodeURIComponent("The private source file could not be loaded.")}`);
 const {data:blob,error:downloadError}=await supabase.storage.from("customer-imports").download(session.storage_path);if(downloadError||!blob)redirect(`${target}?error=${encodeURIComponent("The private source file could not be loaded.")}`);
 try{const preview=await parseCustomerImportFile(new File([blob],session.file_name,{type:blob.type}),worksheet);const {error:updateError}=await supabase.from("customer_imports").update({worksheet_name:preview.worksheetName,source_columns:preview.sourceColumns,total_row_count:preview.rowCount,current_stage:"mapping",status:"mapping",version:session.version+1,last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("business_id",business.id).eq("id",importId).eq("version",session.version);if(updateError)throw new Error(updateError.code);await supabase.from("customer_import_events").insert({business_id:business.id,import_id:importId,event_type:"worksheet_selected",actor_user_id:user.id,metadata:{row_count:preview.rowCount}});redirect(`${target}?success=${encodeURIComponent(`${preview.rowCount.toLocaleString()} rows from “${worksheet}” are ready for column matching.`)}`);}catch(caught){if(caught instanceof Error&&caught.message==="NEXT_REDIRECT")throw caught;console.error("Customer import worksheet selection failed",{businessId:business.id,importId,category:caught instanceof CustomerImportFileError?caught.category:"unexpected"});redirect(`${target}?error=${encodeURIComponent(safeMessage(caught))}`);}
}
