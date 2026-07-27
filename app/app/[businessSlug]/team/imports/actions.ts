"use server";
import {createHash,randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {EmployeeImportFileError,parseEmployeeImportFile} from "@/lib/employeeImport/file";
import {suggestEmployeeImportMapping,validateEmployeeColumnMappings,type EmployeeColumnMapping} from "@/lib/employeeImport/mapping";
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

export async function cancelEmployeeImport(businessSlug:string,importId:string,formData:FormData){
  const {supabase,business,role,isPlatformAdmin}=await requireWorkspace(businessSlug);
  if(!isPlatformAdmin&&!["owner","admin"].includes(role)) redirect(`/app/${businessSlug}/team/imports/${importId}?error=${encodeURIComponent("Only owners and admins can cancel imports.")}`);
  const version=Number(formData.get("version"));
  const stage=String(formData.get("stage")??"mapping");
  if(!Number.isSafeInteger(version)||version<1) redirect(`/app/${businessSlug}/team/imports/${importId}?error=${encodeURIComponent("Refresh this import and try again.")}`);
  const {error}=await supabase.rpc("transition_employee_import",{
    p_import_id:importId,p_expected_version:version,p_next_status:"canceled",
    p_next_stage:stage,p_event_type:"session_canceled",p_metadata:{source:"import_session_ui"},
  });
  if(error){
    console.error("Employee import cancellation failed",{businessId:business.id,importId,code:error.code});
    const message=error.code==="40001"?"This import changed. Refresh and try again.":"The import could not be canceled.";
    redirect(`/app/${businessSlug}/team/imports/${importId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/app/${businessSlug}/team/imports/${importId}?success=${encodeURIComponent("Import canceled. No employee records were created.")}`);
}

export async function saveEmployeeImportMappings(businessSlug:string,importId:string,formData:FormData){
  const {supabase,business,role,isPlatformAdmin}=await requireWorkspace(businessSlug);
  const target=`/app/${businessSlug}/team/imports/${importId}`;
  if(!isPlatformAdmin&&!["owner","admin"].includes(role)) redirect(`${target}?error=${encodeURIComponent("Only owners and admins can map employee imports.")}`);
  const {data:session,error:loadError}=await supabase.from("employee_imports").select("id,version,status,source_columns").eq("business_id",business.id).eq("id",importId).maybeSingle();
  if(loadError||!session){
    console.error("Employee import mapping session load failed",{businessId:business.id,importId,code:loadError?.code});
    redirect(`${target}?error=${encodeURIComponent("The import session could not be loaded.")}`);
  }
  const sources=(session.source_columns as {name:string}[])??[];
  const mappings:EmployeeColumnMapping[]=sources.map((source,sourceOrdinal)=>{
    const destinationField=String(formData.get(`destination_${sourceOrdinal}`)??"").trim()||null;
    const suggestion=suggestEmployeeImportMapping(source.name);
    return {sourceColumn:source.name,sourceOrdinal,destinationField,isIgnored:!destinationField,
      transformation:destinationField==="full_name"?"split_name":"none",
      confidence:destinationField===suggestion.destinationField?suggestion.confidence:destinationField?"manual":"unmatched"};
  });
  const validationError=validateEmployeeColumnMappings(mappings);
  if(validationError) redirect(`${target}?error=${encodeURIComponent(validationError)}`);
  const profileName=String(formData.get("profileName")??"").trim();
  const appliedProfileId=String(formData.get("appliedProfileId")??"").trim();
  const {error}=await supabase.rpc("save_employee_import_mappings",{
    p_import_id:importId,p_expected_version:session.version,p_mappings:mappings,
    p_profile_name:profileName||null,p_applied_profile_id:appliedProfileId||null,
  });
  if(error){
    console.error("Employee import mappings save failed",{businessId:business.id,importId,code:error.code});
    const message=error.code==="40001"?"This import changed. Refresh and review your mappings again.":"The column mappings could not be saved.";
    redirect(`${target}?error=${encodeURIComponent(message)}`);
  }
  redirect(`${target}?success=${encodeURIComponent(profileName?"Mappings confirmed and profile saved.":"Column mappings confirmed.")}`);
}
