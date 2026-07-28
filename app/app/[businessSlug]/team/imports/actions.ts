"use server";
import {createHash,randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {EmployeeImportFileError,parseEmployeeImportFile} from "@/lib/employeeImport/file";
import {suggestEmployeeImportMapping,validateEmployeeColumnMappings,type EmployeeColumnMapping} from "@/lib/employeeImport/mapping";
import {validateEmployeeImportRow,validateNormalizedEmployeeValues} from "@/lib/employeeImport/validation";
import {findEmployeeDuplicate} from "@/lib/employeeImport/duplicates";
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

export async function validateEmployeeImport(businessSlug:string,importId:string){
 const {supabase,business,role,isPlatformAdmin}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`;
 if(!isPlatformAdmin&&!["owner","admin"].includes(role))redirect(`${target}?error=${encodeURIComponent("Only owners and admins can validate imports.")}`);
 const [{data:session,error:sessionError},{data:mappingRows,error:mappingError}]=await Promise.all([
  supabase.from("employee_imports").select("id,version,status,file_name,storage_path,total_row_count").eq("business_id",business.id).eq("id",importId).maybeSingle(),
  supabase.from("employee_import_column_mappings").select("source_column,source_ordinal,destination_field,transformation,confidence,is_ignored").eq("business_id",business.id).eq("import_id",importId).order("source_ordinal"),
 ]);
 if(sessionError||mappingError||!session?.storage_path||!mappingRows?.length){console.error("Employee import validation setup failed",{businessId:business.id,importId,codes:[sessionError?.code,mappingError?.code]});redirect(`${target}?error=${encodeURIComponent("Confirm the column mappings before validating rows.")}`);}
 const {data:fileBlob,error:downloadError}=await supabase.storage.from("employee-imports").download(session.storage_path);
 if(downloadError||!fileBlob){console.error("Employee import source download failed",{businessId:business.id,importId,code:downloadError?.name});redirect(`${target}?error=${encodeURIComponent("The private source file could not be read.")}`);}
 try{
  const parsed=await parseEmployeeImportFile(new File([fileBlob],session.file_name,{type:fileBlob.type}));
  const mappings:EmployeeColumnMapping[]=mappingRows.map(item=>({sourceColumn:item.source_column,sourceOrdinal:item.source_ordinal,destinationField:item.destination_field,transformation:item.transformation,confidence:item.confidence,isIgnored:item.is_ignored}));
  const [{data:roles},{data:territories},{data:qualifications},{data:managers}]=await Promise.all([
   supabase.from("workforce_roles").select("name").eq("business_id",business.id).eq("is_active",true),
   supabase.from("workforce_territories").select("name").eq("business_id",business.id).eq("is_active",true),
   supabase.from("workforce_qualifications").select("name").eq("business_id",business.id).eq("is_active",true),
   supabase.from("employees").select("id,email,employee_number,preferred_name").eq("business_id",business.id).eq("is_active",true),
  ]);
  const names=(items:{name:string}[]|null)=>new Set((items??[]).map(item=>item.name.toLowerCase()));
  const roleNames=names(roles),territoryNames=names(territories),skillNames=names(qualifications);
  const managerNames=new Set((managers??[]).flatMap(item=>[item.id,item.email?.toLowerCase(),item.employee_number?.toLowerCase(),item.preferred_name.toLowerCase()].filter(Boolean) as string[]));
  const rows=parsed.rows.map((row,index)=>{const result=validateEmployeeImportRow(row,mappings),values=result.normalizedValues;
   if(values.role&&!roleNames.has(values.role.toLowerCase()))result.errors.push(`We could not find a matching role named “${values.role}.”`);
   if(values.territory&&!territoryNames.has(values.territory.toLowerCase()))result.errors.push(`We could not find a matching territory named “${values.territory}.”`);
   for(const skill of (values.skills??"").split(/[;,]/).map(value=>value.trim()).filter(Boolean))if(!skillNames.has(skill.toLowerCase()))result.errors.push(`We could not find a matching skill named “${skill}.”`);
   if(values.manager&&!managerNames.has(values.manager.toLowerCase()))result.errors.push(`We could not find the manager “${values.manager}.”`);
   if(values.location)result.warnings.push(`Review the location “${values.location}” before operational assignment.`);
   result.status=result.errors.length?"error":result.warnings.length?"warning":"ready";
   return {sourceRowNumber:index+2,rawValues:row,...result};});
  for(const field of ["email","employee_number"]){const seen=new Map<string,number>();for(const row of rows){const value=row.normalizedValues[field]?.toLowerCase();if(value)seen.set(value,(seen.get(value)??0)+1);}for(const row of rows){const value=row.normalizedValues[field]?.toLowerCase();if(value&&(seen.get(value)??0)>1){row.warnings.push(`${field==="email"?"Email":"Employee ID"} appears more than once in this file.`);if(row.status==="ready")row.status="warning";}}}
  const {error}=await supabase.rpc("save_employee_import_validation",{p_import_id:importId,p_expected_version:session.version,p_rows:rows});
  if(error)throw new Error(`database:${error.code}`);
  redirect(`${target}?success=${encodeURIComponent("Validation complete. Review the rows that need attention.")}`);
 }catch(error){if(error instanceof Error&&error.message==="NEXT_REDIRECT")throw error;console.error("Employee import validation failed",{businessId:business.id,importId,category:error instanceof EmployeeImportFileError?error.category:"validation"});redirect(`${target}?error=${encodeURIComponent("The employee rows could not be validated.")}`);}
}

export async function correctEmployeeImportRow(businessSlug:string,importId:string,rowId:string,formData:FormData){
 const {supabase,business,role,isPlatformAdmin}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`;
 if(!isPlatformAdmin&&!["owner","admin"].includes(role))redirect(`${target}?error=${encodeURIComponent("Only owners and admins can correct imports.")}`);
 const version=Number(formData.get("version")),ignore=formData.get("intent")==="ignore";
 const fields=["first_name","last_name","preferred_name","email","phone","employee_number","job_title","role","employee_type","start_date","employment_status","manager","location","territory","skills","invite","notes"];
 const values=Object.fromEntries(fields.map(field=>[field,String(formData.get(field)??"").trim()]));
 const result=validateNormalizedEmployeeValues(values);
 const [{data:roles},{data:territories},{data:qualifications},{data:managers}]=await Promise.all([
  supabase.from("workforce_roles").select("name").eq("business_id",business.id).eq("is_active",true),
  supabase.from("workforce_territories").select("name").eq("business_id",business.id).eq("is_active",true),
  supabase.from("workforce_qualifications").select("name").eq("business_id",business.id).eq("is_active",true),
  supabase.from("employees").select("id,email,employee_number,preferred_name").eq("business_id",business.id).eq("is_active",true),
 ]);
 const has=(items:{name:string}[]|null,value:string)=>!value||(items??[]).some(item=>item.name.toLowerCase()===value.toLowerCase());
 if(!has(roles,values.role))result.errors.push(`We could not find a matching role named “${values.role}.”`);
 if(!has(territories,values.territory))result.errors.push(`We could not find a matching territory named “${values.territory}.”`);
 for(const skill of values.skills.split(/[;,]/).map(value=>value.trim()).filter(Boolean))if(!has(qualifications,skill))result.errors.push(`We could not find a matching skill named “${skill}.”`);
 const managerKeys=new Set((managers??[]).flatMap(item=>[item.id,item.email?.toLowerCase(),item.employee_number?.toLowerCase(),item.preferred_name.toLowerCase()].filter(Boolean) as string[]));
 if(values.manager&&!managerKeys.has(values.manager.toLowerCase()))result.errors.push(`We could not find the manager “${values.manager}.”`);
 if(values.location)result.warnings.push(`Review the location “${values.location}” before operational assignment.`);
 result.status=result.errors.length?"error":result.warnings.length?"warning":"ready";
 const {error}=await supabase.rpc("revalidate_employee_import_row",{p_import_id:importId,p_row_id:rowId,p_expected_version:version,p_normalized_values:values,p_status:result.status,p_errors:result.errors,p_warnings:result.warnings,p_ignore:ignore});
 if(error){console.error("Employee import row correction failed",{businessId:business.id,importId,code:error.code});redirect(`${target}?error=${encodeURIComponent(error.code==="40001"?"The import changed. Refresh and try again.":"The row could not be updated.")}`);}
 redirect(`${target}?success=${encodeURIComponent(ignore?"Row ignored.":"Row updated and revalidated.")}`);
}

export async function bulkFixEmployeeImport(businessSlug:string,importId:string,formData:FormData){
 const {supabase,business,role,isPlatformAdmin}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`,operation=String(formData.get("operation")??"");
 if(!isPlatformAdmin&&!["owner","admin"].includes(role))redirect(`${target}?error=${encodeURIComponent("Only owners and admins can correct imports.")}`);
 const {data:session}=await supabase.from("employee_imports").select("version").eq("business_id",business.id).eq("id",importId).maybeSingle();
 const {data:rows}=await supabase.from("employee_import_rows").select("id,normalized_values,validation_errors,validation_warnings").eq("business_id",business.id).eq("import_id",importId).eq("is_ignored",false);
 if(!session||!rows)redirect(`${target}?error=${encodeURIComponent("The import rows could not be loaded.")}`);
 const updates=rows.flatMap(row=>{const values={...(row.normalized_values as Record<string,string>)},errors=[...(row.validation_errors as string[])],warnings=[...(row.validation_warnings as string[])];
  if(operation==="blank_status_active"&&!values.employment_status)values.employment_status="active";
  else if(operation==="all_do_not_invite"&&(values.invite??"").toLowerCase()!=="no"){values.invite="no";const index=errors.indexOf("Invite must be Yes or No.");if(index>=0)errors.splice(index,1);}
  else return [];
  return [{id:row.id,normalizedValues:values,errors,warnings,status:errors.length?"error":warnings.length?"warning":"ready"}];
 });
 if(!updates.length)redirect(`${target}?success=${encodeURIComponent("No rows needed that bulk change.")}`);
 const {error}=await supabase.rpc("bulk_revalidate_employee_import_rows",{p_import_id:importId,p_expected_version:session.version,p_rows:updates,p_operation:operation});
 if(error){console.error("Employee import bulk correction failed",{businessId:business.id,importId,code:error.code});redirect(`${target}?error=${encodeURIComponent("The bulk correction could not be applied.")}`);}
 redirect(`${target}?success=${encodeURIComponent(`Bulk correction applied to ${updates.length} rows.`)}`);
}

export async function detectEmployeeImportDuplicates(businessSlug:string,importId:string){
 const {supabase,business,role,isPlatformAdmin}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`;
 if(!isPlatformAdmin&&!["owner","admin"].includes(role))redirect(`${target}?error=${encodeURIComponent("Only owners and admins can review duplicates.")}`);
 const [{data:session},{data:rows},{data:employees}]=await Promise.all([
  supabase.from("employee_imports").select("version").eq("business_id",business.id).eq("id",importId).maybeSingle(),
  supabase.from("employee_import_rows").select("id,normalized_values").eq("business_id",business.id).eq("import_id",importId).eq("is_ignored",false).order("source_row_number"),
  supabase.from("employees").select("id,first_name,last_name,email,phone,employee_number,hire_date").eq("business_id",business.id),
 ]);
 if(!session||!rows||!employees)redirect(`${target}?error=${encodeURIComponent("Duplicate detection could not be started.")}`);
 const seen=new Map<string,string>(),matches=rows.map(row=>{const values=row.normalized_values as Record<string,string>,keys=[values.employee_number&&`id:${values.employee_number.toLowerCase()}`,values.email&&`email:${values.email.toLowerCase()}`].filter(Boolean) as string[];
  const matchedImportRowId=keys.map(key=>seen.get(key)).find(Boolean)??null;for(const key of keys)if(!seen.has(key))seen.set(key,row.id);
  if(matchedImportRowId)return{rowId:row.id,matchType:"definite",reason:"Employee ID or email appears earlier in this file",existingEmployeeId:null,matchedImportRowId,resolution:"skip"};
  return{rowId:row.id,...findEmployeeDuplicate(values,employees),matchedImportRowId:null};
 });
 const {error}=await supabase.rpc("save_employee_import_duplicate_matches",{p_import_id:importId,p_expected_version:session.version,p_matches:matches});
 if(error){console.error("Employee import duplicate detection failed",{businessId:business.id,importId,code:error.code});redirect(`${target}?error=${encodeURIComponent("Duplicate detection could not be completed.")}`);}
 redirect(`${target}?success=${encodeURIComponent("Duplicate review is ready. Definite and possible matches default to Skip.")}`);
}

export async function resolveEmployeeImportDuplicate(businessSlug:string,importId:string,rowId:string,formData:FormData){
 const {supabase,business}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`;
 const resolution=String(formData.get("resolution")??"skip"),version=Number(formData.get("version"));
 const mergeFields=formData.getAll("mergeFields").map(String);
 const {error}=await supabase.rpc("resolve_employee_import_duplicate",{p_import_id:importId,p_row_id:rowId,p_expected_version:version,p_resolution:resolution,p_merge_fields:mergeFields});
 if(error){console.error("Employee import duplicate resolution failed",{businessId:business.id,importId,code:error.code});redirect(`${target}?error=${encodeURIComponent("The duplicate choice could not be saved.")}`);}
 redirect(`${target}?success=${encodeURIComponent("Duplicate resolution saved.")}`);
}

export async function assignEmployeeImportAccess(businessSlug:string,importId:string,rowId:string|null,formData:FormData){
 const {supabase,business}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`;
 const version=Number(formData.get("version")),workforceRoleId=String(formData.get("workforceRoleId")??"")||null;
 const accessRole=String(formData.get("accessRole")??"")||null,invite=formData.get("invite")==="on",confirmElevated=formData.get("confirmElevated")==="on";
 let rowIds=rowId?[rowId]:formData.getAll("rowIds").map(String);
 if(!rowId&&formData.get("scope")==="all"){const {data}=await supabase.from("employee_import_rows").select("id").eq("business_id",business.id).eq("import_id",importId).eq("is_ignored",false).neq("validation_status","error");rowIds=(data??[]).map(row=>row.id);}
 if(!rowIds.length)redirect(`${target}?error=${encodeURIComponent("Select at least one eligible employee row.")}`);
 const {error}=await supabase.rpc("assign_employee_import_access",{p_import_id:importId,p_expected_version:version,p_row_ids:rowIds,p_workforce_role_id:workforceRoleId,p_access_role:accessRole,p_invite:invite,p_confirm_elevated:confirmElevated});
 if(error){console.error("Employee import role assignment failed",{businessId:business.id,importId,code:error.code});const message=error.code==="40001"?"The import changed. Refresh and try again.":"Role and access settings could not be saved.";redirect(`${target}?error=${encodeURIComponent(message)}`);}
 redirect(`${target}?success=${encodeURIComponent(`Role and access settings saved for ${rowIds.length} employee${rowIds.length===1?"":"s"}.`)}`);
}

export async function assignEmployeeImportOperations(businessSlug:string,importId:string,rowId:string|null,formData:FormData){
 const {supabase,business}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`;
 let rowIds=rowId?[rowId]:[];if(!rowId){const {data}=await supabase.from("employee_import_rows").select("id").eq("business_id",business.id).eq("import_id",importId).eq("is_ignored",false).neq("validation_status","error");rowIds=(data??[]).map(row=>row.id);}
 if(!rowIds.length)redirect(`${target}?error=${encodeURIComponent("No eligible employee rows are available for operational assignments.")}`);
 const {error}=await supabase.rpc("assign_employee_import_operations",{
  p_import_id:importId,p_expected_version:Number(formData.get("version")),p_row_ids:rowIds,
  p_manager_employee_id:String(formData.get("managerEmployeeId")??"")||null,
  p_territory_id:String(formData.get("territoryId")??"")||null,
  p_qualification_ids:formData.getAll("qualificationIds").map(String),p_defer:formData.get("defer")==="true",
 });
 if(error){console.error("Employee import operational assignment failed",{businessId:business.id,importId,code:error.code});const message=error.code==="40001"?"The import changed. Refresh and try again.":error.code==="P0002"?"A selected manager, territory, or qualification is no longer available.":"Operational assignments could not be saved.";redirect(`${target}?error=${encodeURIComponent(message)}`);}
 redirect(`${target}?success=${encodeURIComponent(formData.get("defer")==="true"?"Operational assignments deferred safely.":`Operational assignments saved for ${rowIds.length} employees.`)}`);
}

export async function prepareEmployeeImportCommit(businessSlug:string,importId:string,mode:"ready_rows"|"fix_all",invitationMode:"send"|"without",formData:FormData){
 const {supabase,business}=await requireWorkspace(businessSlug),target=`/app/${businessSlug}/team/imports/${importId}`;
 const {error}=await supabase.rpc("prepare_employee_import_commit",{p_import_id:importId,p_expected_version:Number(formData.get("version")),p_mode:mode,p_invitation_mode:invitationMode});
 if(error){console.error("Employee import review confirmation failed",{businessId:business.id,importId,code:error.code});const message=error.code==="40001"?"The import changed. Refresh and review it again.":error.message.includes("Fix blocking")?"Correct every blocking error or choose Import Ready Rows.":error.message.includes("No employee")?"No employee rows are ready to import.":"The final import review could not be confirmed.";redirect(`${target}?error=${encodeURIComponent(message)}`);}
 redirect(`${target}?success=${encodeURIComponent("Import review confirmed. The employees have not been created yet.")}`);
}
