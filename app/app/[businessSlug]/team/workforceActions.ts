"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
import { normalizeOptional, validateEmployeeProfile } from "@/lib/workforce";
import { validateAvailabilityProfile, validateWeeklyIntervals, type WeeklyIntervalInput } from "@/lib/workforceAvailability";
import { validateQualification } from "@/lib/workforceQualifications";
import { splitTerritoryValues, validateTerritory, validateTerritoryAssignment, type TerritoryStrategyConfig } from "@/lib/workforceTerritories";
import { validateWorkforceAsset, WORKFORCE_ASSET_CONDITIONS } from "@/lib/workforceAssets";
import { parseWorkTypes, validateWorkforcePreferences } from "@/lib/workforcePreferences";
import { requireWorkspaceCapability } from "@/lib/workspace";
import {createAndDeliverEmployeeInvitation} from "./actions";

const values=(formData:FormData,key:string)=>formData.getAll(key).map(String).filter(Boolean);
const path=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/team?${kind}=${encodeURIComponent(message)}`;
const employeePayload=(formData:FormData,userId:string)=>{
 const firstName=String(formData.get("firstName")??"").trim(),lastName=String(formData.get("lastName")??"").trim();
 const preferredName=String(formData.get("preferredName")??"").trim()||firstName;
 const terminationDate=normalizeOptional(formData.get("terminationDate"));
 const employmentStatus=String(formData.get("employmentStatus")??"active");
 const payload={first_name:firstName,last_name:lastName,preferred_name:preferredName,legal_name:normalizeOptional(formData.get("legalName")),email:normalizeOptional(formData.get("email"))?.toLowerCase()??null,phone:normalizeOptional(formData.get("phone")),employee_number:normalizeOptional(formData.get("employeeNumber")),job_title:normalizeOptional(formData.get("jobTitle")),employee_type:normalizeOptional(formData.get("employeeType")),employment_status:employmentStatus,manager_employee_id:normalizeOptional(formData.get("managerEmployeeId")),profile_photo_url:normalizeOptional(formData.get("profilePhotoUrl")),hire_date:normalizeOptional(formData.get("hireDate")),termination_date:terminationDate,notes:normalizeOptional(formData.get("notes")),is_active:employmentStatus==="active",updated_by:userId};
 return {payload,error:validateEmployeeProfile({preferredName,firstName,lastName,email:payload.email,employeeType:payload.employee_type,employmentStatus,profilePhotoUrl:payload.profile_photo_url,hireDate:payload.hire_date,terminationDate,isActive:payload.is_active})};
};

async function replaceRoles(supabase:Awaited<ReturnType<typeof requireWorkspaceCapability>>["supabase"],businessId:string,employeeId:string,roleIds:string[],userId:string){
 const {data:validRoles}=roleIds.length?await supabase.from("workforce_roles").select("id").eq("business_id",businessId).eq("is_active",true).in("id",roleIds):{data:[]};
 if((validRoles??[]).length!==new Set(roleIds).size)throw new Error("One or more workforce roles are invalid.");
 const {data:current}=await supabase.from("employee_role_assignments").select("id,workforce_role_id").eq("business_id",businessId).eq("employee_id",employeeId).eq("is_active",true);
 const desired=new Set(roleIds),today=new Date().toISOString().slice(0,10),now=new Date().toISOString();
 const removals=(current??[]).filter(item=>!desired.has(item.workforce_role_id));
 if(removals.length){const {error}=await supabase.from("employee_role_assignments").update({is_active:false,effective_through:today,ended_at:now,ended_by:userId}).in("id",removals.map(item=>item.id)).eq("business_id",businessId);if(error)throw error;}
 const existing=new Set((current??[]).map(item=>item.workforce_role_id));
 const additions=roleIds.filter(id=>!existing.has(id));
 if(additions.length){const {error}=await supabase.from("employee_role_assignments").insert(additions.map(workforceRoleId=>({business_id:businessId,employee_id:employeeId,workforce_role_id:workforceRoleId,assigned_by:userId})));if(error)throw error;}
}

export async function createEmployee(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can add employees."));
 const {payload,error}=employeePayload(formData,user.id);if(error)redirect(path(slug,"error",error));
 if(payload.manager_employee_id){const {data:manager}=await supabase.from("employees").select("id").eq("business_id",business.id).eq("id",payload.manager_employee_id).eq("is_active",true).maybeSingle();if(!manager)redirect(path(slug,"error","Choose an active manager from this business."));}
 const inviteNow=formData.get("inviteNow")==="on",accessRole=String(formData.get("accessRole")??"staff");
 if(inviteNow&&!payload.email)redirect(path(slug,"error","An email address is required when inviting an employee."));
 if(inviteNow&&!["staff","manager","admin"].includes(accessRole))redirect(path(slug,"error","Choose a valid workspace access role."));
 if(inviteNow&&["manager","admin"].includes(accessRole)&&formData.get("confirmElevatedAccess")!=="on")redirect(path(slug,"error","Confirm elevated workspace access before inviting this employee."));
 const {data:employee,error:insertError}=await supabase.from("employees").insert({...payload,business_id:business.id,created_by:user.id}).select("id").single();
 if(insertError||!employee){console.error("Employee creation failed",{businessId:business.id,code:insertError?.code});redirect(path(slug,"error",insertError?.code==="23505"?"That employee email or number is already in use.":"Employee could not be created."));}
 try{await replaceRoles(supabase,business.id,employee.id,values(formData,"roleIds"),user.id);}catch(roleError){await supabase.from("employees").delete().eq("business_id",business.id).eq("id",employee.id);console.error("Employee role initialization failed",{businessId:business.id,errorName:roleError instanceof Error?roleError.name:"unknown"});redirect(path(slug,"error","Employee roles could not be saved."));}
 if(inviteNow){
  const invitation=await createAndDeliverEmployeeInvitation(slug,payload.email!,accessRole);
  revalidatePath(`/app/${slug}/team`);
  if(invitation.error)redirect(path(slug,"success",`Employee added. ${invitation.error}`));
  const outcome=invitation.outcome==="sent"?"Invitation email sent.":invitation.outcome==="not_configured"?"Invitation saved, but email delivery is not configured.":"Invitation saved, but email delivery failed.";
  redirect(path(slug,"success",`Employee added. ${outcome}`));
 }
 revalidatePath(`/app/${slug}/team`);redirect(path(slug,"success","Employee added without login access."));
}

export async function updateEmployee(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can edit employees."));
 const {payload,error}=employeePayload(formData,user.id);if(error)redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent(error)}`);
 if(payload.manager_employee_id===employeeId)redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent("An employee cannot manage themselves.")}`);
 if(payload.manager_employee_id){const {data:manager}=await supabase.from("employees").select("id").eq("business_id",business.id).eq("id",payload.manager_employee_id).eq("is_active",true).maybeSingle();if(!manager)redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent("Choose an active manager from this business.")}`);}
 const {error:updateError}=await supabase.from("employees").update(payload).eq("business_id",business.id).eq("id",employeeId);
 if(updateError){console.error("Employee update failed",{businessId:business.id,employeeId,code:updateError.code});redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent(updateError.code==="23505"?"That employee email or number is already in use.":"Employee could not be updated.")}`);}
 try{await replaceRoles(supabase,business.id,employeeId,values(formData,"roleIds"),user.id);}catch(roleError){console.error("Employee role update failed",{businessId:business.id,employeeId,errorName:roleError instanceof Error?roleError.name:"unknown"});redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent("Employee saved, but roles could not be updated.")}`);}
 revalidatePath(`/app/${slug}/team`);revalidatePath(`/app/${slug}/team/${employeeId}`);redirect(`/app/${slug}/team/${employeeId}?success=${encodeURIComponent("Employee profile saved.")}`);
}

export async function setEmployeeActive(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const active=formData.get("active")==="true";
 const {error}=await supabase.from("employees").update({employment_status:active?"active":"inactive",is_active:active,termination_date:active?null:undefined,updated_by:user.id}).eq("business_id",business.id).eq("id",employeeId);
 if(error)redirect(path(slug,"error","Employee status could not be changed."));
 revalidatePath(`/app/${slug}/team`);redirect(path(slug,"success",active?"Employee activated.":"Employee deactivated."));
}

const employeePath=(slug:string,employeeId:string,kind:"success"|"error",message:string)=>
 `/app/${slug}/team/${employeeId}?${kind}=${encodeURIComponent(message)}`;
const formText=(formData:FormData,key:string)=>String(formData.get(key)??"").trim();

export async function saveEmployeeAvailability(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Only owners and administrators can edit availability."));
 const {data:employee}=await supabase.from("employees").select("id").eq("business_id",business.id).eq("id",employeeId).maybeSingle();
 if(!employee)redirect(employeePath(slug,employeeId,"error","Employee not found."));
 const timeZone=formText(formData,"timeZone");
 const jobsValue=formText(formData,"maximumDailyJobs"),hoursValue=formText(formData,"maximumDailyHours");
 const maximumDailyJobs=jobsValue?Number(jobsValue):null;
 const maximumDailyMinutes=hoursValue?Math.round(Number(hoursValue)*60):null;
 const overtimePreference=formText(formData,"overtimePreference");
 const profileError=validateAvailabilityProfile({timeZone,maximumDailyJobs,maximumDailyMinutes,overtimePreference});
 if(profileError)redirect(employeePath(slug,employeeId,"error",profileError));
 const intervals:WeeklyIntervalInput[]=[];
 for(let weekday=0;weekday<7;weekday+=1){
  if(formData.get(`day_${weekday}`)==="on"){
   intervals.push({weekday,interval_type:"working",starts_at:formText(formData,`start_${weekday}`),ends_at:formText(formData,`end_${weekday}`)});
   if(formData.get(`break_${weekday}`)==="on")intervals.push({weekday,interval_type:"break",starts_at:formText(formData,`breakStart_${weekday}`),ends_at:formText(formData,`breakEnd_${weekday}`)});
  }
 }
 const scheduleError=validateWeeklyIntervals(intervals);
 if(scheduleError)redirect(employeePath(slug,employeeId,"error",scheduleError));
 const {error:saveError}=await supabase.rpc("save_employee_availability",{
  p_business_id:business.id,p_employee_id:employeeId,p_time_zone:timeZone,
  p_maximum_daily_jobs:maximumDailyJobs,p_maximum_daily_minutes:maximumDailyMinutes,
  p_overtime_preference:overtimePreference,p_intervals:intervals,
 });
 if(saveError){
  console.error("Employee availability save failed",{businessId:business.id,employeeId,code:saveError.code,actorUserId:user.id});
  redirect(employeePath(slug,employeeId,"error","Employee availability could not be saved."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 revalidatePath(`/app/${slug}/schedule`);
 redirect(employeePath(slug,employeeId,"success","Availability saved."));
}

export async function addEmployeeAvailabilityException(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const {data:profile}=await supabase.from("employee_availability_profiles").select("time_zone").eq("business_id",business.id).eq("employee_id",employeeId).maybeSingle();
 if(!profile)redirect(employeePath(slug,employeeId,"error","Save availability settings before adding time off."));
 const parse=(value:string)=>{const [date,time]=value.split("T");return date&&time?zonedDateTimeToUtc(date,time.slice(0,5),profile.time_zone):null;};
 const startsAt=parse(formText(formData,"startsAt")),endsAt=parse(formText(formData,"endsAt"));
 const exceptionType=formText(formData,"exceptionType"),availabilityEffect=formText(formData,"availabilityEffect");
 if(!startsAt||!endsAt||Number.isNaN(startsAt.getTime())||endsAt<=startsAt
  ||!["pto","vacation","holiday","sick","break","other"].includes(exceptionType)
  ||!["available","unavailable"].includes(availabilityEffect)){
  redirect(employeePath(slug,employeeId,"error","Enter a valid availability exception."));
 }
 const {error}=await supabase.from("employee_availability_exceptions").insert({
  business_id:business.id,employee_id:employeeId,exception_type:exceptionType,
  starts_at:startsAt.toISOString(),ends_at:endsAt.toISOString(),
  availability_effect:availabilityEffect,approval_status:"approved",
  reason:normalizeOptional(formData.get("reason")),created_by:user.id,updated_by:user.id,
 });
 if(error){
  console.error("Employee availability exception save failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error","The availability exception could not be saved."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 revalidatePath(`/app/${slug}/schedule`);
 redirect(employeePath(slug,employeeId,"success","Availability exception added."));
}

export async function deleteEmployeeAvailabilityException(slug:string,employeeId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const {error}=await supabase.from("employee_availability_exceptions").delete()
  .eq("business_id",business.id).eq("employee_id",employeeId).eq("id",formText(formData,"exceptionId"));
 if(error){
  console.error("Employee availability exception removal failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error","The availability exception could not be removed."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 revalidatePath(`/app/${slug}/schedule`);
 redirect(employeePath(slug,employeeId,"success","Availability exception removed."));
}

export async function addEmployeeQualification(slug:string,employeeId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const qualificationType=formText(formData,"qualificationType"),name=formText(formData,"name");
 const issuedOn=normalizeOptional(formData.get("issuedOn")),expiresOn=normalizeOptional(formData.get("expiresOn"));
 const validationError=validateQualification({type:qualificationType,name,issuedOn,expiresOn});
 if(validationError)redirect(employeePath(slug,employeeId,"error",validationError));
 const {error}=await supabase.rpc("assign_employee_qualification",{
  p_business_id:business.id,p_employee_id:employeeId,p_qualification_type:qualificationType,p_name:name,
  p_proficiency_level:formText(formData,"proficiencyLevel"),p_credential_number:formText(formData,"credentialNumber"),
  p_issuing_authority:formText(formData,"issuingAuthority"),p_issued_on:issuedOn,p_expires_on:expiresOn,
  p_notes:formText(formData,"notes"),
 });
 if(error){
  console.error("Employee qualification assignment failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error",error.code==="23505"?"That employee already has this active qualification.":"The qualification could not be added."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);revalidatePath(`/app/${slug}/dispatch`);
 redirect(employeePath(slug,employeeId,"success","Qualification added."));
}

export async function endEmployeeQualification(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const {error}=await supabase.from("employee_qualifications").update({
  status:"revoked",ended_at:new Date().toISOString(),ended_by:user.id,
 }).eq("business_id",business.id).eq("employee_id",employeeId).eq("id",formText(formData,"assignmentId")).eq("status","active");
 if(error){
  console.error("Employee qualification removal failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error","The qualification could not be removed."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);revalidatePath(`/app/${slug}/dispatch`);
 redirect(employeePath(slug,employeeId,"success","Qualification removed."));
}

export async function createEmployeeTerritory(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const name=formText(formData,"name"),territoryType=formText(formData,"territoryType");
 const postalCodes=splitTerritoryValues(formText(formData,"postalCodes"));
 const neighborhoods=splitTerritoryValues(formText(formData,"neighborhoods"));
 const boundary=formText(formData,"boundaryGeojson"),color=formText(formData,"color");
 const description=formText(formData,"description"),notes=formText(formData,"notes");
 const parentTerritoryId=formText(formData,"parentTerritoryId");
 const cities=splitTerritoryValues(formText(formData,"cities"));
 const formNumber=(key:string)=>{const raw=formText(formData,key);return raw?Number(raw):Number.NaN;};
 const radiusMiles=formNumber("radiusMiles");
 const strategyConfig:TerritoryStrategyConfig={
  ...(cities.length?{cities}:{}),
  ...(territoryType==="radius"?{center:{latitude:formNumber("radiusLatitude"),longitude:formNumber("radiusLongitude")},radius_meters:Math.round(radiusMiles*1609.344)}:{}),
 };
 const validationError=validateTerritory({name,type:territoryType,postalCodes,neighborhoods,boundary,color,description,notes,strategyConfig});
 if(validationError)redirect(employeePath(slug,employeeId,"error",validationError));
 if(parentTerritoryId){
  const {data:parent}=await supabase.from("workforce_territories").select("id").eq("business_id",business.id).eq("id",parentTerritoryId).maybeSingle();
  if(!parent)redirect(employeePath(slug,employeeId,"error","The selected parent territory is not available."));
 }
 const {error}=await supabase.from("workforce_territories").insert({
  business_id:business.id,name,territory_type:territoryType,postal_codes:postalCodes,
  neighborhoods,boundary_geojson:boundary?JSON.parse(boundary):null,color,
  strategy_config:strategyConfig,
  description:description||null,notes:notes||null,parent_territory_id:parentTerritoryId||null,
  created_by:user.id,updated_by:user.id,
 });
 if(error){
  console.error("Workforce territory creation failed",{businessId:business.id,code:error.code});
  redirect(employeePath(slug,employeeId,"error",error.code==="23505"?"A territory with that name already exists.":"The territory could not be created."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 redirect(employeePath(slug,employeeId,"success","Territory created."));
}

export async function assignEmployeeTerritory(slug:string,employeeId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const territoryId=formText(formData,"territoryId"),assignmentType=formText(formData,"assignmentType");
 const effectiveFrom=formText(formData,"effectiveFrom"),effectiveThrough=normalizeOptional(formData.get("effectiveThrough"));
 const validationError=validateTerritoryAssignment({territoryId,employeeId,assignmentType,effectiveFrom,effectiveThrough});
 if(validationError)redirect(employeePath(slug,employeeId,"error",validationError));
 const {data:territory}=await supabase.from("workforce_territories").select("id").eq("business_id",business.id).eq("id",territoryId).eq("is_active",true).maybeSingle();
 if(!territory)redirect(employeePath(slug,employeeId,"error","That territory is not available."));
 const {error}=await supabase.rpc("assign_territory_employee",{
  p_business_id:business.id,p_employee_id:employeeId,p_territory_id:territoryId,
  p_assignment_type:assignmentType,p_effective_from:effectiveFrom,
  p_effective_through:effectiveThrough,p_notes:normalizeOptional(formData.get("notes")),
 });
 if(error){
  console.error("Employee territory assignment failed",{businessId:business.id,employeeId,territoryId,code:error.code,message:error.message,details:error.details,hint:error.hint});
  const message=error.code==="23505"?"That coverage is already assigned."
   :error.code==="42703"?"Territory assignment synchronization is out of date. Apply the territory assignment repair migration."
   :["42883","PGRST202"].includes(error.code)?"Apply the Epic 8.5 Checkpoint 5 territory assignment migration."
   :error.code==="42501"?"You do not have permission to assign territory coverage."
   :error.code==="23503"?"The selected employee or territory is no longer available."
   :"The territory could not be assigned. Review the server log for the database error code.";
  redirect(employeePath(slug,employeeId,"error",message));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);revalidatePath(`/app/${slug}/dispatch`);
 redirect(employeePath(slug,employeeId,"success","Territory assigned."));
}

export async function endEmployeeTerritory(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const {error}=await supabase.from("employee_territory_assignments").update({ended_at:new Date().toISOString(),ended_by:user.id})
  .eq("business_id",business.id).eq("employee_id",employeeId).eq("id",formText(formData,"assignmentId")).is("ended_at",null);
 if(error){
  console.error("Employee territory removal failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error","The territory assignment could not be ended."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);revalidatePath(`/app/${slug}/dispatch`);
 redirect(employeePath(slug,employeeId,"success","Territory assignment ended."));
}

export async function createWorkforceAsset(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const name=formText(formData,"name"),assetType=formText(formData,"assetType");
 const yearValue=formText(formData,"modelYear"),modelYear=yearValue?Number(yearValue):null;
 const validationError=validateWorkforceAsset({name,type:assetType,year:modelYear});
 if(validationError)redirect(employeePath(slug,employeeId,"error",validationError));
 const condition=formText(formData,"condition");
 if(!WORKFORCE_ASSET_CONDITIONS.includes(condition as typeof WORKFORCE_ASSET_CONDITIONS[number])){
  redirect(employeePath(slug,employeeId,"error","Choose a valid asset condition."));
 }
 const {error}=await supabase.from("workforce_assets").insert({
  business_id:business.id,name,asset_type:assetType,model_year:modelYear,condition,
  status:condition==="out_of_service"?"maintenance":"available",
  asset_number:normalizeOptional(formData.get("assetNumber")),serial_number:normalizeOptional(formData.get("serialNumber")),
  manufacturer:normalizeOptional(formData.get("manufacturer")),model:normalizeOptional(formData.get("model")),
  license_plate:normalizeOptional(formData.get("licensePlate")),vin:normalizeOptional(formData.get("vin")),
  notes:normalizeOptional(formData.get("notes")),created_by:user.id,updated_by:user.id,
 });
 if(error){
  console.error("Workforce asset creation failed",{businessId:business.id,code:error.code});
  redirect(employeePath(slug,employeeId,"error",error.code==="23505"?"That asset number or serial number is already in use.":"The asset could not be created."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 redirect(employeePath(slug,employeeId,"success","Asset added."));
}

export async function assignWorkforceAsset(slug:string,employeeId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const assetId=formText(formData,"assetId");
 if(!assetId)redirect(employeePath(slug,employeeId,"error","Choose an available asset."));
 const expectedValue=formText(formData,"expectedReturnAt");
 const [expectedDate,expectedTime]=expectedValue.split("T");
 const expectedReturnAt=expectedValue&&expectedDate&&expectedTime
  ?zonedDateTimeToUtc(expectedDate,expectedTime.slice(0,5),business.timezone):null;
 if(expectedReturnAt&&Number.isNaN(expectedReturnAt.getTime()))redirect(employeePath(slug,employeeId,"error","Enter a valid expected return date."));
 const {error}=await supabase.rpc("assign_workforce_asset",{
  p_business_id:business.id,p_employee_id:employeeId,p_asset_id:assetId,
  p_expected_return_at:expectedReturnAt?.toISOString()??null,
  p_assignment_notes:formText(formData,"assignmentNotes"),
 });
 if(error){
  console.error("Workforce asset assignment failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error",error.code==="23505"?"That asset is already assigned.":"The asset could not be assigned."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 redirect(employeePath(slug,employeeId,"success","Asset assigned."));
}

export async function returnWorkforceAsset(slug:string,employeeId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const returnCondition=formText(formData,"returnCondition");
 if(!WORKFORCE_ASSET_CONDITIONS.includes(returnCondition as typeof WORKFORCE_ASSET_CONDITIONS[number])){
  redirect(employeePath(slug,employeeId,"error","Choose a valid return condition."));
 }
 const {error}=await supabase.rpc("return_workforce_asset",{
  p_business_id:business.id,p_assignment_id:formText(formData,"assignmentId"),
  p_return_condition:returnCondition,p_return_notes:formText(formData,"returnNotes"),
 });
 if(error){
  console.error("Workforce asset return failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error","The asset could not be returned."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 redirect(employeePath(slug,employeeId,"success","Asset returned."));
}

export async function saveEmployeePreferences(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(employeePath(slug,employeeId,"error","Permission denied."));
 const preferred=parseWorkTypes(formText(formData,"preferredWorkTypes"));
 const avoided=parseWorkTypes(formText(formData,"avoidedWorkTypes"));
 const start=formText(formData,"preferredStartTime"),end=formText(formData,"preferredEndTime");
 const validationError=validateWorkforcePreferences({preferred,avoided,start,end});
 if(validationError)redirect(employeePath(slug,employeeId,"error",validationError));
 const {error}=await supabase.from("employee_scheduling_preferences").upsert({
  business_id:business.id,employee_id:employeeId,preferred_work_types:preferred,
  avoided_work_types:avoided,preferred_start_time:start||null,preferred_end_time:end||null,
  workload_preference:formText(formData,"workloadPreference"),
  customer_interaction_preference:formText(formData,"customerInteractionPreference"),
  notes:normalizeOptional(formData.get("notes")),updated_by:user.id,
 },{onConflict:"employee_id"});
 if(error){
  console.error("Employee preference save failed",{businessId:business.id,employeeId,code:error.code});
  redirect(employeePath(slug,employeeId,"error","Employee preferences could not be saved."));
 }
 revalidatePath(`/app/${slug}/team/${employeeId}`);
 redirect(employeePath(slug,employeeId,"success","Work preferences saved."));
}
