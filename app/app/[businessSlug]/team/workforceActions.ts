"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
import { normalizeOptional, validateEmployeeProfile } from "@/lib/workforce";
import { validateAvailabilityProfile, validateWeeklyIntervals, type WeeklyIntervalInput } from "@/lib/workforceAvailability";
import { requireWorkspace } from "@/lib/workspace";

const values=(formData:FormData,key:string)=>formData.getAll(key).map(String).filter(Boolean);
const path=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/team?${kind}=${encodeURIComponent(message)}`;
const employeePayload=(formData:FormData,userId:string)=>{
 const preferredName=String(formData.get("preferredName")??"").trim();
 const terminationDate=normalizeOptional(formData.get("terminationDate"));
 const payload={preferred_name:preferredName,legal_name:normalizeOptional(formData.get("legalName")),email:normalizeOptional(formData.get("email"))?.toLowerCase()??null,phone:normalizeOptional(formData.get("phone")),employee_number:normalizeOptional(formData.get("employeeNumber")),profile_photo_url:normalizeOptional(formData.get("profilePhotoUrl")),hire_date:normalizeOptional(formData.get("hireDate")),termination_date:terminationDate,notes:normalizeOptional(formData.get("notes")),is_active:formData.get("isActive")==="on",updated_by:userId};
 return {payload,error:validateEmployeeProfile({preferredName,email:payload.email,profilePhotoUrl:payload.profile_photo_url,hireDate:payload.hire_date,terminationDate,isActive:payload.is_active})};
};

async function replaceRoles(supabase:Awaited<ReturnType<typeof requireWorkspace>>["supabase"],businessId:string,employeeId:string,roleIds:string[],userId:string){
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
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can add employees."));
 const {payload,error}=employeePayload(formData,user.id);if(error)redirect(path(slug,"error",error));
 const {data:employee,error:insertError}=await supabase.from("employees").insert({...payload,business_id:business.id,created_by:user.id}).select("id").single();
 if(insertError||!employee){console.error("Employee creation failed",{businessId:business.id,code:insertError?.code});redirect(path(slug,"error",insertError?.code==="23505"?"That employee email or number is already in use.":"Employee could not be created."));}
 try{await replaceRoles(supabase,business.id,employee.id,values(formData,"roleIds"),user.id);}catch(roleError){await supabase.from("employees").delete().eq("business_id",business.id).eq("id",employee.id);console.error("Employee role initialization failed",{businessId:business.id,errorName:roleError instanceof Error?roleError.name:"unknown"});redirect(path(slug,"error","Employee roles could not be saved."));}
 revalidatePath(`/app/${slug}/team`);redirect(path(slug,"success","Employee added."));
}

export async function updateEmployee(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can edit employees."));
 const {payload,error}=employeePayload(formData,user.id);if(error)redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent(error)}`);
 const {error:updateError}=await supabase.from("employees").update(payload).eq("business_id",business.id).eq("id",employeeId);
 if(updateError){console.error("Employee update failed",{businessId:business.id,employeeId,code:updateError.code});redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent(updateError.code==="23505"?"That employee email or number is already in use.":"Employee could not be updated.")}`);}
 try{await replaceRoles(supabase,business.id,employeeId,values(formData,"roleIds"),user.id);}catch(roleError){console.error("Employee role update failed",{businessId:business.id,employeeId,errorName:roleError instanceof Error?roleError.name:"unknown"});redirect(`/app/${slug}/team/${employeeId}?error=${encodeURIComponent("Employee saved, but roles could not be updated.")}`);}
 revalidatePath(`/app/${slug}/team`);revalidatePath(`/app/${slug}/team/${employeeId}`);redirect(`/app/${slug}/team/${employeeId}?success=${encodeURIComponent("Employee profile saved.")}`);
}

export async function setEmployeeActive(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const active=formData.get("active")==="true";
 const {error}=await supabase.from("employees").update({is_active:active,termination_date:active?null:new Date().toISOString().slice(0,10),updated_by:user.id}).eq("business_id",business.id).eq("id",employeeId);
 if(error)redirect(path(slug,"error","Employee status could not be changed."));
 revalidatePath(`/app/${slug}/team`);redirect(path(slug,"success",active?"Employee activated.":"Employee deactivated."));
}

const employeePath=(slug:string,employeeId:string,kind:"success"|"error",message:string)=>
 `/app/${slug}/team/${employeeId}?${kind}=${encodeURIComponent(message)}`;
const formText=(formData:FormData,key:string)=>String(formData.get(key)??"").trim();

export async function saveEmployeeAvailability(slug:string,employeeId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
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
 const {supabase,user,business,role}=await requireWorkspace(slug);
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
 const {supabase,business,role}=await requireWorkspace(slug);
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
