"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import {
  isPotentialCustomerDuplicate,
  isValidCrmEmail,
  isValidCrmPhone,
  customerWriteErrorMessage,
} from "@/lib/crmValidation";
import { GoogleGeocodingProvider } from "@/lib/geocoding/googleProvider";
import {
  clearManualServiceLocationCoordinates,
  resolveServiceLocationAddress,
  setManualServiceLocationCoordinates,
} from "@/lib/geocoding/service";
import { requireWorkspaceCapability } from "@/lib/workspace";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {refreshAffectedTechnicianRoutes} from "@/lib/routing/automaticRouteRefresh";
import {dateInTimeZone} from "@/lib/bookingTime";

export type CrmActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const valuesFrom = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>;

function servicePlanWriteError(error:{code?:string;message?:string;details?:string|null;hint?:string|null}|null){
 const code=error?.code||"unknown";
 const combined=[error?.message,error?.details,error?.hint].filter(Boolean).join(" ");
 if(code==="42501")return "You do not have permission to create service plans for this business.";
 if(code==="23503")return "The selected customer, location, service, or technician is no longer available.";
 if(code==="23505")return "This recurring service already exists for the selected customer and date.";
 if(code==="23514"){
  if(combined.includes("scheduling"))return "The automatic scheduling window is not valid for this service plan.";
  if(combined.includes("duration"))return "The service duration is outside the supported range.";
  if(combined.includes("money"))return "One of the service prices, discounts, or fees is invalid.";
  return `The service-plan settings failed database validation (${code}).`;
 }
 if(code==="PGRST204"||code==="42703"){
  const missing=error?.message?.match(/(?:find the|column) ['"]?([a-z0-9_]+)['"]? column/i)?.[1]
   ??error?.message?.match(/['"]([a-z0-9_]+)['"].*schema cache/i)?.[1];
  return `The recurring-service scheduling field${missing?` “${missing}”`:""} is not available through the Supabase API (${code}).`;
 }
 return `The service plan could not be created (${code}).`;
}

async function refreshServicePlanRoutes({
 supabase,business,userId,planId,
}:{
 supabase:Awaited<ReturnType<typeof requireWorkspaceCapability>>["supabase"];
 business:{id:string;timezone:string};
 userId:string;
 planId:string;
}){
 const admin=getSupabaseAdmin();
 if(!admin){
  console.warn("Automatic recurring route refresh is unavailable",{businessId:business.id,planId,reason:"service_role_not_configured"});
  return null;
 }
 const {data:jobs,error}=await supabase.from("jobs")
  .select("id,starts_at,assigned_technician_id")
  .eq("business_id",business.id).eq("recurring_service_series_id",planId)
  .eq("is_deleted",false).gte("starts_at",new Date().toISOString())
  .not("status","in",'("completed","canceled","declined")')
  .not("assigned_technician_id","is",null);
 if(error){
  console.error("Recurring route jobs could not be loaded",{businessId:business.id,planId,code:error.code});
  return null;
 }
 return refreshAffectedTechnicianRoutes({
  admin,authenticated:supabase,businessId:business.id,businessTimeZone:business.timezone,
  actorUserId:userId,jobs:jobs??[],
 });
}

async function synchronizeServicePlanTechnician({
 supabase,businessId,planId,technicianId,
}:{
 supabase:Awaited<ReturnType<typeof requireWorkspaceCapability>>["supabase"];
 businessId:string;
 planId:string;
 technicianId:string|null;
}){
 if(!technicianId)return;
 const {data:jobs,error}=await supabase.from("jobs")
  .select("id,assigned_technician_id").eq("business_id",businessId)
  .eq("recurring_service_series_id",planId).eq("is_deleted",false)
  .gte("starts_at",new Date().toISOString())
  .not("status","in",'("completed","canceled","declined")');
 if(error){
  console.error("Service-plan technician synchronization failed",{businessId,planId,code:error.code});
  return;
 }
 for(const job of jobs??[]){
  if(job.assigned_technician_id===technicianId)continue;
  const {error:assignmentError}=await supabase.rpc("set_job_primary_technician",{
   p_job_id:job.id,p_technician_id:technicianId,
  });
  if(assignmentError)console.error("Service-plan job assignment failed",{
   businessId,planId,jobId:job.id,code:assignmentError.code,
  });
 }
}

async function synchronizeLocationServicePlans({
 supabase,business,userId,locationId,
}:{
 supabase:Awaited<ReturnType<typeof requireWorkspaceCapability>>["supabase"];
 business:{id:string;timezone:string};
 userId:string;
 locationId:string;
}){
 const [{data:location},{data:plans}]=await Promise.all([
  supabase.from("service_locations").select("default_technician_id")
   .eq("business_id",business.id).eq("id",locationId).maybeSingle(),
  supabase.from("recurring_service_series").select("id,default_employee_id")
   .eq("business_id",business.id).eq("service_location_id",locationId)
   .eq("status","active").eq("is_active",true),
 ]);
 let failures=0,skippedDays=0;
 for(const plan of plans??[]){
  await synchronizeServicePlanTechnician({
   supabase,businessId:business.id,planId:plan.id,
   technicianId:plan.default_employee_id??location?.default_technician_id??null,
  });
  const refresh=await refreshServicePlanRoutes({supabase,business,userId,planId:plan.id});
  failures+=refresh?.failures??0;
  skippedDays+=refresh?.skippedDays??0;
 }
 return {plans:(plans??[]).length,failures,skippedDays};
}

function validateCustomer(formData: FormData) {
  const errors: Record<string, string> = {};
  const first = text(formData, "firstName");
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const secondaryPhone = text(formData, "secondaryPhone");
  if (!first) errors.firstName = "Enter a first name.";
  if (!email) errors.email = "Enter an email address.";
  else if (!isValidCrmEmail(email)) errors.email = "Enter a valid email address.";
  if (!phone) errors.phone = "Enter a primary phone number.";
  else if (!isValidCrmPhone(phone)) errors.phone = "Enter a valid phone number.";
  if (!isValidCrmPhone(secondaryPhone)) errors.secondaryPhone = "Enter a valid secondary phone.";
  return errors;
}

async function duplicateWarning(
  supabase: Awaited<ReturnType<typeof requireWorkspaceCapability>>["supabase"],
  businessId: string,
  email: string,
  phone: string,
  excludeId?: string,
) {
  let query = supabase.from("customers").select("id,first_name,last_name,email,phone").eq("business_id", businessId).eq("is_deleted", false);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.limit(250);
  return (data ?? []).find((customer) =>
    isPotentialCustomerDuplicate(customer, email, phone),
  );
}

export async function createCustomer(
  slug: string,
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) return { error: "You do not have permission to add customers.", values: valuesFrom(formData) };
  const fieldErrors = validateCustomer(formData);
  const values = valuesFrom(formData);
  if (Object.keys(fieldErrors).length) return { error: "Please correct the highlighted fields.", fieldErrors, values };
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const duplicate = await duplicateWarning(supabase, business.id, email, phone);
  if (duplicate && email && duplicate.email?.toLowerCase() === email) {
    return {
      error: `A customer with this email already exists: ${duplicate.first_name} ${duplicate.last_name}.`,
      fieldErrors: { email: "Email addresses must be unique within this business." },
      values,
    };
  }
  if (duplicate && text(formData, "confirmDuplicate") !== "true") {
    return {
      error: `Possible duplicate: ${duplicate.first_name} ${duplicate.last_name}. Review the record or submit again to create anyway.`,
      fieldErrors: { duplicate: "A customer with this email or phone already exists." },
      values: { ...values, confirmDuplicate: "true" },
    };
  }
  const { data, error } = await supabase.from("customers").insert({
    business_id: business.id,
    first_name: text(formData, "firstName"),
    last_name: text(formData, "lastName"),
    company_name: text(formData, "companyName") || null,
    email: email || null,
    phone: phone || null,
    secondary_phone: text(formData, "secondaryPhone") || null,
    preferred_contact_method: text(formData, "preferredContactMethod") || "email",
    notes: text(formData, "notes") || null,
    tags: text(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    lead_source: text(formData, "leadSource") || null,
    is_active: text(formData, "isActive") === "true",
    created_by: user.id,
    updated_by: user.id,
  }).select("id").single();
  if (error || !data) {
    console.error("CRM customer creation failed", { code: error?.code, message:error?.message, hint:error?.hint, businessId: business.id });
    return { error: customerWriteErrorMessage(error??undefined,"created"), values };
  }
  revalidatePath(`/app/${slug}/customers`);
  redirect(`/app/${slug}/customers/${data.id}?success=Customer+created`);
}

export async function updateCustomer(
  slug: string,
  customerId: string,
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to edit customers.", values };
  const fieldErrors = validateCustomer(formData);
  if (Object.keys(fieldErrors).length) return { error: "Please correct the highlighted fields.", fieldErrors, values };
  const { data: owned } = await supabase.from("customers").select("id").eq("id", customerId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!owned) return { error: "Customer not found.", values };
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const duplicate = await duplicateWarning(supabase, business.id, email, phone, customerId);
  if (duplicate && email && duplicate.email?.toLowerCase() === email) {
    return {
      error: `That email belongs to ${duplicate.first_name} ${duplicate.last_name}.`,
      fieldErrors: { email: "Email addresses must be unique within this business." },
      values,
    };
  }
  if (duplicate && text(formData, "confirmDuplicate") !== "true") {
    return { error: `Possible duplicate: ${duplicate.first_name} ${duplicate.last_name}.`, fieldErrors: { duplicate: "Confirm to save anyway." }, values: { ...values, confirmDuplicate: "true" } };
  }
  const { error } = await supabase.from("customers").update({
    first_name: text(formData, "firstName"),
    last_name: text(formData, "lastName"),
    company_name: text(formData, "companyName") || null,
    email: email || null,
    phone: phone || null,
    secondary_phone: text(formData, "secondaryPhone") || null,
    preferred_contact_method: text(formData, "preferredContactMethod") || "email",
    notes: text(formData, "notes") || null,
    tags: text(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    lead_source: text(formData, "leadSource") || null,
    is_active: text(formData, "isActive") === "true",
    updated_by: user.id,
  }).eq("id", customerId).eq("business_id", business.id);
  if (error) {
    console.error("CRM customer update failed", { code: error.code, message:error.message, hint:error.hint, businessId: business.id, customerId });
    return { error: customerWriteErrorMessage(error,"saved"), values };
  }
  revalidatePath(`/app/${slug}/customers`);
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(`/app/${slug}/customers/${customerId}?success=Customer+updated`);
}

export async function archiveCustomer(slug: string, customerId: string) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const { error } = await supabase.from("customers").update({ is_deleted: true, is_active: false, updated_by: user.id }).eq("id", customerId).eq("business_id", business.id);
  if (error) redirect(`/app/${slug}/customers/${customerId}?error=Customer+could+not+be+archived`);
  revalidatePath(`/app/${slug}/customers`);
  redirect(`/app/${slug}/customers?success=Customer+archived`);
}

export async function assignCustomerOperations(slug:string,customerId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"customer_management");
 const target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to manage customer assignments.")}`);
 const locationId=text(formData,"serviceLocationId"),mode=text(formData,"assignmentMode");
 const territoryId=text(formData,"territoryId")||null,technicianId=text(formData,"technicianId")||null;
 const {data:location}=await supabase.from("service_locations").select("id").eq("id",locationId).eq("customer_id",customerId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle();
 if(!location)redirect(`${target}?error=${encodeURIComponent("The service location could not be found.")}`);
 if(mode==="automatic"){
  const {error}=await supabase.from("service_locations").update({operational_assignment_source:"automatic",updated_by:user.id}).eq("id",locationId).eq("business_id",business.id);
  if(error){console.error("Customer automatic assignment failed",{businessId:business.id,customerId,locationId,code:error.code,message:error.message,details:error.details,hint:error.hint});redirect(`${target}?error=${encodeURIComponent(`Automatic assignment could not be recalculated (${error.code}).`)}`);}
 }else{
  if(territoryId){
   const {data:territory}=await supabase.from("workforce_territories").select("id").eq("id",territoryId).eq("business_id",business.id).eq("is_active",true).maybeSingle();
   if(!territory)redirect(`${target}?error=${encodeURIComponent("Choose an active territory from this workspace.")}`);
  }
  if(technicianId){
   const {data:technician}=await supabase.from("technician_profiles").select("id").eq("id",technicianId).eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).eq("can_be_assigned_jobs",true).maybeSingle();
   if(!technician)redirect(`${target}?error=${encodeURIComponent("Choose an assignable technician from this workspace.")}`);
  }
  const {error}=await supabase.from("service_locations").update({
   territory_id:territoryId,default_technician_id:technicianId,
   operational_assignment_source:"manual",updated_by:user.id,
  }).eq("id",locationId).eq("business_id",business.id);
  if(error){console.error("Customer manual assignment failed",{businessId:business.id,customerId,locationId,code:error.code});redirect(`${target}?error=${encodeURIComponent("The customer assignment could not be saved.")}`);}
 }
 const {data:resolved}=await supabase.from("service_locations").select("default_technician_id").eq("id",locationId).eq("business_id",business.id).maybeSingle();
 if(resolved?.default_technician_id){
  const {data:jobs}=await supabase.from("jobs").select("id").eq("business_id",business.id).eq("customer_id",customerId).eq("service_location_id",locationId).eq("is_deleted",false).is("assigned_technician_id",null).gte("starts_at",new Date().toISOString()).not("status","in",'("completed","canceled","declined")');
  for(const job of jobs??[]){
   const {error}=await supabase.rpc("set_job_primary_technician",{p_job_id:job.id,p_technician_id:resolved.default_technician_id});
   if(error)console.error("Customer future job assignment failed",{businessId:business.id,customerId,locationId,jobId:job.id,code:error.code});
  }
 }
 const routeRefresh=await synchronizeLocationServicePlans({supabase,business,userId:user.id,locationId});
 revalidatePath(target);revalidatePath(`/app/${slug}/dispatch`);revalidatePath(`/app/${slug}/schedule`);
 redirect(`${target}?success=${encodeURIComponent(routeRefresh.failures||routeRefresh.skippedDays
  ?"Customer assignment saved; some recurring route days still need attention."
  :routeRefresh.plans
   ?"Customer assignment saved and recurring route days optimized."
   :mode==="automatic"?"Address assignment refreshed":"Customer assignment saved")}`);
}

export async function createServicePlan(slug:string,customerId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"customer_management");
 const target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to create service plans.")}`);
 const name=text(formData,"name"),locationId=text(formData,"serviceLocationId"),serviceId=text(formData,"serviceId");
 const automatic=formData.get("scheduleAutomatically")==="on";
 const startDate=text(formData,"startDate")||dateInTimeZone(new Date(),business.timezone),endDate=text(formData,"endDate")||null;
 const firstDate=text(formData,"firstRecurringDate")||startDate;
 const schedulingFlexDays=automatic?Number(text(formData,"schedulingFlexDays")||7):0;
 const intervalValue=Number(text(formData,"intervalValue")),intervalUnit=text(formData,"intervalUnit");
 const duration=Number(text(formData,"durationMinutes")),price=Number(text(formData,"recurringPrice"));
 if(!name||!locationId||!serviceId||!startDate||!firstDate)redirect(`${target}?error=${encodeURIComponent("Complete every required service-plan field.")}`);
 if(!Number.isInteger(schedulingFlexDays)||schedulingFlexDays<0||schedulingFlexDays>30)redirect(`${target}?error=${encodeURIComponent("Choose a valid automatic scheduling window.")}`);
 if(!Number.isInteger(intervalValue)||intervalValue<1||intervalValue>120||!["day","week","month","year"].includes(intervalUnit))redirect(`${target}?error=${encodeURIComponent("Choose a valid recurring cadence.")}`);
 if(!Number.isInteger(duration)||duration<1||duration>10080||!Number.isFinite(price)||price<0)redirect(`${target}?error=${encodeURIComponent("Enter a valid duration and recurring price.")}`);
 if(endDate&&endDate<startDate)redirect(`${target}?error=${encodeURIComponent("The service-plan end date cannot be before its start date.")}`);
 const [{data:customer},{data:location},{data:service}]=await Promise.all([
  supabase.from("customers").select("id").eq("business_id",business.id).eq("id",customerId).eq("is_deleted",false).maybeSingle(),
  supabase.from("service_locations").select("id,default_technician_id").eq("business_id",business.id).eq("customer_id",customerId).eq("id",locationId).eq("is_deleted",false).maybeSingle(),
  supabase.from("services").select("id").eq("business_id",business.id).eq("id",serviceId).eq("is_deleted",false).maybeSingle(),
 ]);
 if(!customer||!location||!service)redirect(`${target}?error=${encodeURIComponent("The selected customer, location, or service is unavailable.")}`);
 const employeeId=text(formData,"employeeId")||null;
 if(employeeId){const {data:employee}=await supabase.from("technician_profiles").select("id").eq("business_id",business.id).eq("id",employeeId).eq("is_active",true).eq("can_be_assigned_jobs",true).maybeSingle();if(!employee)redirect(`${target}?error=${encodeURIComponent("Choose an active assignable technician.")}`);}
 const initialRequired=formData.get("initialServiceRequired")==="on",initialDate=text(formData,"initialServiceDate")||null;
 if(initialRequired&&!initialDate)redirect(`${target}?error=${encodeURIComponent("Choose an initial-service date.")}`);
 const payload={
  business_id:business.id,customer_id:customerId,service_location_id:locationId,service_id:serviceId,name,status:"active",is_active:true,
  start_date:startDate,end_date:endDate,first_recurring_date:firstDate,next_due_on:firstDate,cadence_interval:intervalValue,cadence_unit:intervalUnit,
  initial_service_required:initialRequired,initial_service_date:initialDate,initial_service_price:Number(text(formData,"initialServicePrice")||0),
  initial_service_duration_minutes:initialRequired?Number(text(formData,"initialServiceDuration")||duration):null,initial_service_description:text(formData,"initialServiceDescription")||null,
  recurring_price:price,taxable:formData.get("taxable")==="on",default_duration_minutes:duration,preferred_time_window:text(formData,"preferredTimeWindow")||"no_preference",
  scheduling_mode:automatic?"route_optimized":"fixed_date",scheduling_flex_days:schedulingFlexDays,
  default_employee_id:employeeId,billing_rule:"after_each_completed_service",created_by:user.id,updated_by:user.id,
 };
 let {data:plan,error}=await supabase.from("recurring_service_series").insert(payload).select("id").single();
 // A fixed-date plan can safely use the database defaults while PostgREST
 // refreshes newly added scheduling columns. Never downgrade an automatic plan.
 if(error?.code==="PGRST204"&&!automatic){
  const {scheduling_mode:_,scheduling_flex_days:__,...fixedDatePayload}=payload;
  void _;void __;
  const fallback=await supabase.from("recurring_service_series").insert(fixedDatePayload).select("id").single();
  plan=fallback.data;error=fallback.error;
 }
 if(error||!plan){
  console.error("Service plan creation failed",{
   businessId:business.id,customerId,code:error?.code,message:error?.message,
   details:error?.details,hint:error?.hint,
  });
  redirect(`${target}?error=${encodeURIComponent(servicePlanWriteError(error))}`);
 }
 const {error:auditError}=await supabase.from("service_plan_audit_events").insert({business_id:business.id,service_plan_id:plan.id,event_type:"service_plan_created",actor_user_id:user.id,new_value:{name,interval_value:intervalValue,interval_unit:intervalUnit,first_recurring_date:firstDate,recurring_price:price,scheduling_mode:automatic?"route_optimized":"fixed_date",scheduling_flex_days:schedulingFlexDays}});
 if(auditError)console.error("Service plan creation audit failed",{businessId:business.id,planId:plan.id,code:auditError.code});
 const {error:generationError}=await supabase.rpc("generate_service_plan_jobs",{p_plan_id:plan.id,p_horizon_days:60});
 if(generationError)console.error("Initial service plan generation failed",{businessId:business.id,planId:plan.id,code:generationError.code,message:generationError.message});
 let routeRefresh=null;
 if(!generationError){
  await synchronizeServicePlanTechnician({
   supabase,businessId:business.id,planId:plan.id,
   technicianId:employeeId??location.default_technician_id??null,
  });
  routeRefresh=await refreshServicePlanRoutes({supabase,business,userId:user.id,planId:plan.id});
 }
 revalidatePath(target);revalidatePath(`/app/${slug}/jobs`);revalidatePath(`/app/${slug}/dispatch`);revalidatePath(`/app/${slug}/schedule`);
 redirect(generationError
  ?`${target}?reconcilePlan=${plan.id}&warning=${encodeURIComponent("Service plan created, but upcoming jobs could not be generated.")}`
  :routeRefresh?.failures||routeRefresh?.skippedDays
   ?`${target}?success=${encodeURIComponent("Service plan created and jobs assigned. Some route days still need attention.")}`
   :`${target}?success=${encodeURIComponent("Service plan created, jobs assigned, and affected routes optimized.")}`);
}

export async function retryServicePlanJobGeneration(slug:string,customerId:string,planId:string){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to generate service-plan jobs.")}`);
 const {data:plan}=await supabase.from("recurring_service_series").select("id,default_employee_id,service_location_id").eq("id",planId).eq("business_id",business.id).eq("customer_id",customerId).eq("status","active").maybeSingle();
 if(!plan)redirect(`${target}?error=${encodeURIComponent("The active service plan could not be found.")}`);
 const {error}=await supabase.rpc("generate_service_plan_jobs",{p_plan_id:plan.id,p_horizon_days:60});
 if(error){
  console.error("Service plan job generation retry failed",{businessId:business.id,customerId,planId,code:error.code,message:error.message,hint:error.hint,details:error.details});
  const safeDetail=error.code==="42703"
   ?` ${error.message.replace(/[^\w\s".()_-]/g,"").slice(0,240)}`
   :"";
  redirect(`${target}?reconcilePlan=${plan.id}&error=${encodeURIComponent(`Upcoming jobs still could not be generated (${error.code||"unknown"}).${safeDetail}`)}`);
 }
 const {data:location}=await supabase.from("service_locations").select("default_technician_id")
  .eq("id",plan.service_location_id).eq("business_id",business.id).maybeSingle();
 await synchronizeServicePlanTechnician({
  supabase,businessId:business.id,planId:plan.id,
  technicianId:plan.default_employee_id??location?.default_technician_id??null,
 });
 const routeRefresh=await refreshServicePlanRoutes({supabase,business,userId:user.id,planId:plan.id});
 revalidatePath(target);revalidatePath(`/app/${slug}/jobs`);revalidatePath(`/app/${slug}/dispatch`);revalidatePath(`/app/${slug}/schedule`);
 redirect(`${target}?success=${encodeURIComponent(routeRefresh?.failures||routeRefresh?.skippedDays
  ?"Upcoming jobs generated and assigned; some route days still need attention."
  :"Upcoming jobs generated, assigned, and affected routes optimized.")}`);
}

export async function updateServicePlan(slug:string,customerId:string,planId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to edit service plans.")}`);
 const name=text(formData,"name"),locationId=text(formData,"serviceLocationId"),serviceId=text(formData,"serviceId"),startDate=text(formData,"startDate"),endDate=text(formData,"endDate")||null,firstDate=text(formData,"firstRecurringDate");
 const automatic=formData.get("scheduleAutomatically")==="on",schedulingFlexDays=automatic?Number(text(formData,"schedulingFlexDays")||7):0;
 const intervalValue=Number(text(formData,"intervalValue")),intervalUnit=text(formData,"intervalUnit"),duration=Number(text(formData,"durationMinutes")),price=Number(text(formData,"recurringPrice")),employeeId=text(formData,"employeeId")||null;
 if(!name||!locationId||!serviceId||!startDate||!firstDate||!Number.isInteger(intervalValue)||intervalValue<1||intervalValue>120||!["day","week","month","year"].includes(intervalUnit)||!Number.isInteger(duration)||duration<1||duration>10080||!Number.isFinite(price)||price<0||!Number.isInteger(schedulingFlexDays)||schedulingFlexDays<0||schedulingFlexDays>30||Boolean(endDate&&endDate<startDate))redirect(`${target}?error=${encodeURIComponent("Review the service-plan dates, cadence, duration, price, and scheduling window.")}`);
 const [{data:plan},{data:location},{data:service},{data:employee}]=await Promise.all([
  supabase.from("recurring_service_series").select("id").eq("id",planId).eq("business_id",business.id).eq("customer_id",customerId).maybeSingle(),
  supabase.from("service_locations").select("id,default_technician_id").eq("id",locationId).eq("business_id",business.id).eq("customer_id",customerId).eq("is_deleted",false).maybeSingle(),
  supabase.from("services").select("id").eq("id",serviceId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle(),
  employeeId?supabase.from("technician_profiles").select("id").eq("id",employeeId).eq("business_id",business.id).eq("is_active",true).eq("can_be_assigned_jobs",true).maybeSingle():Promise.resolve({data:null}),
 ]);
 if(!plan||!location||!service||(employeeId&&!employee))redirect(`${target}?error=${encodeURIComponent("The selected plan, location, service, or technician is unavailable.")}`);
 const {error}=await supabase.from("recurring_service_series").update({name,service_location_id:locationId,service_id:serviceId,start_date:startDate,end_date:endDate,first_recurring_date:firstDate,next_due_on:firstDate,cadence_interval:intervalValue,cadence_unit:intervalUnit,default_duration_minutes:duration,recurring_price:price,preferred_time_window:text(formData,"preferredTimeWindow")||"no_preference",taxable:formData.get("taxable")==="on",scheduling_mode:automatic?"route_optimized":"fixed_date",scheduling_flex_days:schedulingFlexDays,default_employee_id:employeeId,last_generated_through:null,updated_by:user.id}).eq("id",planId).eq("business_id",business.id).eq("customer_id",customerId);
 if(error){console.error("Service plan update failed",{businessId:business.id,customerId,planId,code:error.code,message:error.message});redirect(`${target}?error=${encodeURIComponent("The service plan could not be updated.")}`);}
 const {error:generationError}=await supabase.rpc("generate_service_plan_jobs",{p_plan_id:planId,p_horizon_days:60});
 if(generationError)console.error("Updated service plan generation failed",{businessId:business.id,planId,code:generationError.code,message:generationError.message});
 let routeRefresh=null;
 if(!generationError){
  await synchronizeServicePlanTechnician({
   supabase,businessId:business.id,planId,
   technicianId:employeeId??location.default_technician_id??null,
  });
  routeRefresh=await refreshServicePlanRoutes({supabase,business,userId:user.id,planId});
 }
 revalidatePath(`/app/${slug}/customers/${customerId}`);revalidatePath(`/app/${slug}/jobs`);revalidatePath(`/app/${slug}/dispatch`);revalidatePath(`/app/${slug}/schedule`);
 redirect(generationError
  ?`${target}?reconcilePlan=${planId}&warning=${encodeURIComponent("Service plan updated, but upcoming jobs could not be generated.")}#service-plans`
  :`${target}?success=${encodeURIComponent(routeRefresh?.failures||routeRefresh?.skippedDays?"Service plan updated; some route days still need attention.":"Service plan updated and affected routes optimized.")}#service-plans`);
}

export async function deleteServicePlan(slug:string,customerId:string,planId:string){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to delete service plans.")}`);
 const {data:plan}=await supabase.from("recurring_service_series").select("id").eq("id",planId).eq("business_id",business.id).eq("customer_id",customerId).maybeSingle();
 if(!plan)redirect(`${target}?error=${encodeURIComponent("Service plan not found.")}`);
 const {error}=await supabase.rpc("change_service_plan_status",{p_plan_id:planId,p_status:"canceled",p_reason:"Deleted by user"});
 if(error){console.error("Service plan deletion failed",{businessId:business.id,customerId,planId,code:error.code,message:error.message});redirect(`${target}?error=${encodeURIComponent("The service plan could not be deleted.")}`);}
 const now=new Date().toISOString();
 const {error:jobsError}=await supabase.from("jobs").update({status:"canceled",canceled_at:now,cancellation_reason:"Recurring service plan deleted",updated_at:now}).eq("business_id",business.id).eq("recurring_service_series_id",planId).gte("starts_at",now).not("status","in","(completed,canceled)");
 if(jobsError)console.error("Deleted service plan future-job cancellation failed",{businessId:business.id,planId,code:jobsError.code,message:jobsError.message});
 revalidatePath(`/app/${slug}/customers/${customerId}`);revalidatePath(`/app/${slug}/jobs`);
 redirect(`${target}?success=${encodeURIComponent(jobsError?"Service plan deleted; review its future jobs.":"Service plan deleted and future jobs canceled.")}#service-plans`);
}

async function recurringVisit(slug:string,customerId:string,jobId:string){
 const workspace=await requireWorkspaceCapability(slug,"customer_management");
 if(!canManageCustomers(workspace.role))return {...workspace,job:null};
 const {data:job}=await workspace.supabase.from("jobs").select("id,business_id,recurring_service_series_id,service_plan_occurrence_id,status,starts_at").eq("id",jobId).eq("business_id",workspace.business.id).eq("customer_id",customerId).eq("is_deleted",false).not("recurring_service_series_id","is",null).not("service_plan_occurrence_id","is",null).maybeSingle();
 return {...workspace,job};
}

export async function skipRecurringVisit(slug:string,customerId:string,jobId:string){
 const {supabase,user,business,role,job}=await recurringVisit(slug,customerId,jobId),target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role)||!job)redirect(`${target}?error=${encodeURIComponent("The recurring visit could not be skipped.")}`);
 const now=new Date().toISOString();
 const {error:occurrenceError}=await supabase.from("service_plan_occurrences").update({status:"skipped",skipped_at:now,skipped_by:user.id,skip_reason:"Skipped by user",updated_at:now}).eq("id",job.service_plan_occurrence_id).eq("business_id",business.id);
 const {error:jobError}=occurrenceError?{error:null}:await supabase.from("jobs").update({status:"canceled",canceled_at:now,cancellation_reason:"Service plan occurrence skipped",updated_at:now,updated_by:user.id}).eq("id",job.id).eq("business_id",business.id).not("status","in","(completed,canceled)");
 if(occurrenceError||jobError){console.error("Recurring visit skip failed",{businessId:business.id,customerId,jobId,occurrenceCode:occurrenceError?.code,jobCode:jobError?.code});redirect(`${target}?error=${encodeURIComponent("The visit could not be skipped.")}`);}
 await supabase.from("service_plan_audit_events").insert({business_id:business.id,service_plan_id:job.recurring_service_series_id,occurrence_id:job.service_plan_occurrence_id,job_id:job.id,event_type:"occurrence_skipped",actor_user_id:user.id,new_value:{reason:"Skipped by user"}});
 revalidatePath(`/app/${slug}/customers/${customerId}`);revalidatePath(`/app/${slug}/jobs`);redirect(`${target}?success=${encodeURIComponent("Visit skipped.")}#service-plans`);
}

export async function reactivateRecurringVisit(slug:string,customerId:string,jobId:string){
 const {supabase,user,business,role,job}=await recurringVisit(slug,customerId,jobId),target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role)||!job)redirect(`${target}?error=${encodeURIComponent("The recurring visit could not be reactivated.")}`);
 const now=new Date().toISOString();
 const {error:occurrenceError}=await supabase.from("service_plan_occurrences").update({status:"generated",skipped_at:null,skipped_by:null,skip_reason:null,updated_at:now}).eq("id",job.service_plan_occurrence_id).eq("business_id",business.id).eq("status","skipped");
 const {error:jobError}=occurrenceError?{error:null}:await supabase.from("jobs").update({status:"scheduled",canceled_at:null,cancellation_reason:null,updated_at:now,updated_by:user.id}).eq("id",job.id).eq("business_id",business.id).eq("status","canceled").eq("cancellation_reason","Service plan occurrence skipped");
 if(occurrenceError||jobError){console.error("Recurring visit reactivation failed",{businessId:business.id,customerId,jobId,occurrenceCode:occurrenceError?.code,jobCode:jobError?.code});redirect(`${target}?error=${encodeURIComponent("The skipped visit could not be reactivated.")}`);}
 await supabase.from("service_plan_audit_events").insert({business_id:business.id,service_plan_id:job.recurring_service_series_id,occurrence_id:job.service_plan_occurrence_id,job_id:job.id,event_type:"occurrence_reactivated",actor_user_id:user.id,new_value:{status:"generated"}});
 revalidatePath(`/app/${slug}/customers/${customerId}`);revalidatePath(`/app/${slug}/jobs`);redirect(`${target}?success=${encodeURIComponent("Skipped visit reactivated.")}#service-plans`);
}

export async function cancelRecurringVisit(slug:string,customerId:string,jobId:string){
 const {supabase,user,business,role,job}=await recurringVisit(slug,customerId,jobId),target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role)||!job)redirect(`${target}?error=${encodeURIComponent("The recurring visit could not be canceled.")}`);
 const now=new Date().toISOString();
 const {error:occurrenceError}=await supabase.from("service_plan_occurrences").update({status:"canceled",updated_at:now}).eq("id",job.service_plan_occurrence_id).eq("business_id",business.id);
 const {error:jobError}=occurrenceError?{error:null}:await supabase.from("jobs").update({status:"canceled",canceled_at:now,cancellation_reason:"Recurring visit canceled",updated_at:now,updated_by:user.id}).eq("id",job.id).eq("business_id",business.id).not("status","in","(completed,canceled)");
 if(occurrenceError||jobError){console.error("Recurring visit cancellation failed",{businessId:business.id,customerId,jobId,occurrenceCode:occurrenceError?.code,jobCode:jobError?.code});redirect(`${target}?error=${encodeURIComponent("The visit could not be canceled.")}`);}
 await supabase.from("service_plan_audit_events").insert({business_id:business.id,service_plan_id:job.recurring_service_series_id,occurrence_id:job.service_plan_occurrence_id,job_id:job.id,event_type:"occurrence_canceled",actor_user_id:user.id,new_value:{reason:"Canceled by user"}});
 revalidatePath(`/app/${slug}/customers/${customerId}`);revalidatePath(`/app/${slug}/jobs`);redirect(`${target}?success=${encodeURIComponent("Visit canceled.")}#service-plans`);
}

export async function changeServicePlanStatus(slug:string,customerId:string,planId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/${customerId}#service-plans`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to change service plans.")}`);
 const status=text(formData,"status"),reason=text(formData,"reason")||null;
 const {data:plan}=await supabase.from("recurring_service_series").select("id").eq("id",planId).eq("business_id",business.id).eq("customer_id",customerId).maybeSingle();
 if(!plan)redirect(`${target}?error=${encodeURIComponent("Service plan not found.")}`);
 const {error}=await supabase.rpc("change_service_plan_status",{p_plan_id:planId,p_status:status,p_reason:reason});
 if(error){console.error("Service plan status change failed",{businessId:business.id,planId,code:error.code});redirect(`${target}?error=${encodeURIComponent("The service plan status could not be changed.")}`);}
 if(status==="active"){const {error:generationError}=await supabase.rpc("generate_service_plan_jobs",{p_plan_id:planId,p_horizon_days:60});if(generationError)console.error("Resumed service plan reconciliation failed",{businessId:business.id,planId,code:generationError.code});}
 revalidatePath(`/app/${slug}/customers/${customerId}`);revalidatePath(`/app/${slug}/jobs`);redirect(`${target}?success=${encodeURIComponent(`Service plan ${status}.`)}`);
}

export async function skipNextServicePlanOccurrence(slug:string,customerId:string,planId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/${customerId}#service-plans`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to skip service occurrences.")}`);
 const {data:plan}=await supabase.from("recurring_service_series").select("id").eq("id",planId).eq("business_id",business.id).eq("customer_id",customerId).maybeSingle();
 if(!plan)redirect(`${target}?error=${encodeURIComponent("Service plan not found.")}`);
 const {error}=await supabase.rpc("skip_next_service_plan_occurrence",{p_plan_id:planId,p_reason:text(formData,"reason")||null});
 if(error){console.error("Service plan occurrence skip failed",{businessId:business.id,planId,code:error.code});redirect(`${target}?error=${encodeURIComponent(error.code==="P0002"?"There is no upcoming occurrence to skip.":"The next occurrence could not be skipped.")}`);}
 revalidatePath(`/app/${slug}/customers/${customerId}`);revalidatePath(`/app/${slug}/jobs`);redirect(`${target}?success=${encodeURIComponent("The next service occurrence was skipped.")}`);
}

function locationPayload(formData: FormData) {
  const placeId = text(formData, "googlePlaceId");
  if (process.env.GOOGLE_MAPS_API_KEY && !placeId) return { error: "Select an address from Google’s suggestions." };
  return {
    providerPlaceId: placeId || null,
    data: {
      location_name: text(formData, "locationName") || "Service location",
      street_address: text(formData, "streetAddress"),
      unit: text(formData, "unit") || null,
      city: text(formData, "city"),
      state: text(formData, "state"),
      postal_code: text(formData, "postalCode"),
      country: text(formData, "country") || "US",
      access_instructions: text(formData, "accessInstructions") || null,
      gate_code: text(formData, "gateCode") || null,
      parking_notes: text(formData, "parkingNotes") || null,
      pets_present: text(formData, "petsPresent") === "true",
      property_notes: text(formData, "propertyNotes") || null,
      is_primary: text(formData, "isPrimary") === "true",
      is_active: text(formData, "isActive") === "true",
    },
  };
}

export async function saveServiceLocation(
  slug: string,
  customerId: string,
  locationId: string | null,
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to manage locations.", values };
  const { data: customer } = await supabase.from("customers").select("id").eq("id", customerId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!customer) return { error: "Customer not found.", values };
  const payload = locationPayload(formData);
  const payloadError = "error" in payload ? payload.error : null;
  if (payloadError) return { error: payloadError, fieldErrors: { address: payloadError }, values };
  const locationData = "data" in payload ? payload.data : null;
  if (!locationData) return { error: "The service address could not be prepared.", values };
  if (!locationData.street_address || !locationData.city || !locationData.state || !locationData.postal_code) {
    return { error: "Complete the service address.", fieldErrors: { address: "Street, city, state, and postal code are required." }, values };
  }
  if (locationData.is_primary) {
    await supabase.from("service_locations").update({ is_primary: false, updated_by: user.id }).eq("business_id", business.id).eq("customer_id", customerId).eq("is_primary", true);
  }
  const saveResult = locationId
    ? await supabase.from("service_locations").update({ ...locationData, updated_by: user.id }).eq("id", locationId).eq("business_id", business.id).eq("customer_id", customerId).select("id").maybeSingle()
    : await supabase.from("service_locations").insert({ ...locationData, business_id: business.id, customer_id: customerId, created_by: user.id, updated_by: user.id }).select("id").single();
  if (saveResult.error || !saveResult.data) {
    console.error("CRM location save failed", { code: saveResult.error?.code, businessId: business.id, customerId, locationId });
    return { error: "The service location could not be saved.", values };
  }
  let geocodingMessage = "Location saved";
  if (process.env.GOOGLE_MAPS_API_KEY) {
    const resolution = await resolveServiceLocationAddress({
      supabase,
      businessId: business.id,
      serviceLocationId: saveResult.data.id,
      provider: new GoogleGeocodingProvider(),
      providerPlaceId: payload.providerPlaceId,
    });
    if (!resolution.ok) geocodingMessage = "Location saved; address needs verification";
  }
  const routeRefresh=await synchronizeLocationServicePlans({
    supabase,business,userId:user.id,locationId:saveResult.data.id,
  });
  if(routeRefresh.plans){
    geocodingMessage=routeRefresh.failures||routeRefresh.skippedDays
      ?"Location saved; some recurring route days need attention"
      :"Location saved and recurring route days optimized";
  }
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  revalidatePath(`/app/${slug}/dispatch`);
  revalidatePath(`/app/${slug}/schedule`);
  redirect(`/app/${slug}/customers/${customerId}?success=${encodeURIComponent(geocodingMessage)}`);
}

export async function retryServiceLocationGeocoding(
  slug: string,
  customerId: string,
  locationId: string,
) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const result = await resolveServiceLocationAddress({
    supabase,
    businessId: business.id,
    serviceLocationId: locationId,
    provider: new GoogleGeocodingProvider(),
    force: true,
  });
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(
    `/app/${slug}/customers/${customerId}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

export async function overrideServiceLocationCoordinates(
  slug: string,
  customerId: string,
  locationId: string,
  formData: FormData,
) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const result = await setManualServiceLocationCoordinates({
    supabase,
    businessId: business.id,
    serviceLocationId: locationId,
    latitude: Number(text(formData, "latitude")),
    longitude: Number(text(formData, "longitude")),
  });
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(
    `/app/${slug}/customers/${customerId}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

export async function clearServiceLocationCoordinateOverride(
  slug: string,
  customerId: string,
  locationId: string,
) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const result = await clearManualServiceLocationCoordinates({
    supabase,
    businessId: business.id,
    serviceLocationId: locationId,
  });
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(
    `/app/${slug}/customers/${customerId}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

export async function archiveServiceLocation(slug: string, customerId: string, locationId: string) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  await supabase.from("service_locations").update({ is_deleted: true, is_active: false, is_primary: false, updated_by: user.id }).eq("id", locationId).eq("customer_id", customerId).eq("business_id", business.id);
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(`/app/${slug}/customers/${customerId}?success=Location+archived`);
}
