"use server";
import {createHash,randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {EmployeeImportFileError,parseEmployeeImportFile} from "@/lib/employeeImport/file";
import {requireWorkspace} from "@/lib/workspace";

const safeMessage=(error:unknown)=>error instanceof EmployeeImportFileError
  ? error.message
  : "The file could not be uploaded. Check the format and try again.";

export async function uploadEmployeeImport(businessSlug:string,formData:FormData){
  const {supabase,user,business,role,isPlatformAdmin}=await requireWorkspace(businessSlug);
  if(!isPlatformAdmin&&!["owner","admin"].includes(role)) redirect(`/app/${businessSlug}/team/imports?error=${encodeURIComponent("Only owners and admins can import employees.")}`);
  const file=formData.get("employee_file");
  const suppliedKey=String(formData.get("request_key")??"");
  const requestKey=/^[0-9a-f-]{36}$/i.test(suppliedKey)?suppliedKey:randomUUID();
  if(!(file instanceof File)||!file.size) redirect(`/app/${businessSlug}/team/imports?error=${encodeURIComponent("Choose a CSV or Excel file to continue.")}`);
  try{
    const preview=await parseEmployeeImportFile(file);
    const bytes=Buffer.from(await file.arrayBuffer());
    const checksum=createHash("sha256").update(bytes).digest("hex");
    const {data:existing}=await supabase.from("employee_imports").select("id").eq("business_id",business.id).eq("request_key",requestKey).maybeSingle();
    if(existing?.id) redirect(`/app/${businessSlug}/team/imports?success=${encodeURIComponent("This file was already uploaded.")}&importId=${existing.id}`);
    const id=randomUUID();
    const storagePath=`${business.id}/${id}/source.${preview.extension}`;
    const {error:uploadError}=await supabase.storage.from("employee-imports").upload(storagePath,file,{contentType:file.type||undefined,upsert:false});
    if(uploadError) throw new Error(`storage:${uploadError.message}`);
    const {error:insertError}=await supabase.from("employee_imports").insert({
      id,business_id:business.id,file_name:file.name,file_extension:preview.extension,
      file_size_bytes:file.size,file_checksum:checksum,storage_path:storagePath,
      source_columns:preview.sourceColumns,total_row_count:preview.rowCount,
      uploaded_by:user.id,request_key:requestKey,status:"uploaded",current_stage:"mapping",
    });
    if(insertError){
      await supabase.storage.from("employee-imports").remove([storagePath]);
      throw new Error(`database:${insertError.code}`);
    }
    redirect(`/app/${businessSlug}/team/imports?success=${encodeURIComponent(`${preview.rowCount.toLocaleString()} employee rows are ready for column matching.`)}&importId=${id}`);
  }catch(error){
    if(error instanceof Error&&error.message==="NEXT_REDIRECT") throw error;
    console.error("Employee import upload failed",{
      businessId:business.id,actorUserId:user.id,
      category:error instanceof EmployeeImportFileError?error.category:"unexpected",
      message:error instanceof Error?error.message:String(error),
    });
    redirect(`/app/${businessSlug}/team/imports?error=${encodeURIComponent(safeMessage(error))}`);
  }
}
