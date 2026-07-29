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

export type CrmActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const valuesFrom = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>;

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

export async function createServicePlan(slug:string,customerId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"customer_management");
 const target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to create service plans.")}`);
 const name=text(formData,"name"),locationId=text(formData,"serviceLocationId"),serviceId=text(formData,"serviceId");
 const startDate=text(formData,"startDate"),endDate=text(formData,"endDate")||null,firstDate=text(formData,"firstRecurringDate");
 const intervalValue=Number(text(formData,"intervalValue")),intervalUnit=text(formData,"intervalUnit");
 const duration=Number(text(formData,"durationMinutes")),price=Number(text(formData,"recurringPrice"));
 if(!name||!locationId||!serviceId||!startDate||!firstDate)redirect(`${target}?error=${encodeURIComponent("Complete every required service-plan field.")}`);
 if(!Number.isInteger(intervalValue)||intervalValue<1||intervalValue>120||!["day","week","month","year"].includes(intervalUnit))redirect(`${target}?error=${encodeURIComponent("Choose a valid recurring cadence.")}`);
 if(!Number.isInteger(duration)||duration<1||duration>10080||!Number.isFinite(price)||price<0)redirect(`${target}?error=${encodeURIComponent("Enter a valid duration and recurring price.")}`);
 if(endDate&&endDate<startDate)redirect(`${target}?error=${encodeURIComponent("The service-plan end date cannot be before its start date.")}`);
 const [{data:customer},{data:location},{data:service}]=await Promise.all([
  supabase.from("customers").select("id").eq("business_id",business.id).eq("id",customerId).eq("is_deleted",false).maybeSingle(),
  supabase.from("service_locations").select("id").eq("business_id",business.id).eq("customer_id",customerId).eq("id",locationId).eq("is_deleted",false).maybeSingle(),
  supabase.from("services").select("id").eq("business_id",business.id).eq("id",serviceId).eq("is_deleted",false).maybeSingle(),
 ]);
 if(!customer||!location||!service)redirect(`${target}?error=${encodeURIComponent("The selected customer, location, or service is unavailable.")}`);
 const employeeId=text(formData,"employeeId")||null;
 if(employeeId){const {data:employee}=await supabase.from("technician_profiles").select("id").eq("business_id",business.id).eq("id",employeeId).eq("is_active",true).eq("can_be_assigned_jobs",true).maybeSingle();if(!employee)redirect(`${target}?error=${encodeURIComponent("Choose an active assignable technician.")}`);}
 const initialRequired=formData.get("initialServiceRequired")==="on",initialDate=text(formData,"initialServiceDate")||null;
 if(initialRequired&&!initialDate)redirect(`${target}?error=${encodeURIComponent("Choose an initial-service date.")}`);
 const {data:plan,error}=await supabase.from("recurring_service_series").insert({
  business_id:business.id,customer_id:customerId,service_location_id:locationId,service_id:serviceId,name,status:"active",is_active:true,
  start_date:startDate,end_date:endDate,first_recurring_date:firstDate,next_due_on:firstDate,cadence_interval:intervalValue,cadence_unit:intervalUnit,
  initial_service_required:initialRequired,initial_service_date:initialDate,initial_service_price:Number(text(formData,"initialServicePrice")||0),
  initial_service_duration_minutes:initialRequired?Number(text(formData,"initialServiceDuration")||duration):null,initial_service_description:text(formData,"initialServiceDescription")||null,
  recurring_price:price,taxable:formData.get("taxable")==="on",default_duration_minutes:duration,preferred_time_window:text(formData,"preferredTimeWindow")||"no_preference",
  default_employee_id:employeeId,billing_rule:"after_each_completed_service",created_by:user.id,updated_by:user.id,
 }).select("id").single();
 if(error||!plan){console.error("Service plan creation failed",{businessId:business.id,customerId,code:error?.code,message:error?.message});redirect(`${target}?error=${encodeURIComponent("The service plan could not be created.")}`);}
 const {error:auditError}=await supabase.from("service_plan_audit_events").insert({business_id:business.id,service_plan_id:plan.id,event_type:"service_plan_created",actor_user_id:user.id,new_value:{name,interval_value:intervalValue,interval_unit:intervalUnit,first_recurring_date:firstDate,recurring_price:price}});
 if(auditError)console.error("Service plan creation audit failed",{businessId:business.id,planId:plan.id,code:auditError.code});
 const {error:generationError}=await supabase.rpc("generate_service_plan_jobs",{p_plan_id:plan.id,p_horizon_days:60});
 if(generationError)console.error("Initial service plan generation failed",{businessId:business.id,planId:plan.id,code:generationError.code,message:generationError.message});
 if(!generationError&&employeeId){
  const {data:generatedJobs}=await supabase.from("jobs").select("id").eq("business_id",business.id).eq("recurring_service_series_id",plan.id).is("assigned_technician_id",null);
  for(const job of generatedJobs??[]){const {error:assignmentError}=await supabase.rpc("set_job_primary_technician",{p_job_id:job.id,p_technician_id:employeeId});if(assignmentError)console.error("Generated service-plan job assignment failed",{businessId:business.id,planId:plan.id,jobId:job.id,code:assignmentError.code});}
 }
 revalidatePath(target);revalidatePath(`/app/${slug}/jobs`);
 redirect(generationError
  ?`${target}?reconcilePlan=${plan.id}&warning=${encodeURIComponent("Service plan created, but upcoming jobs could not be generated.")}`
  :`${target}?success=${encodeURIComponent("Service plan created and upcoming jobs generated.")}`);
}

export async function retryServicePlanJobGeneration(slug:string,customerId:string,planId:string){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"customer_management"),target=`/app/${slug}/customers/${customerId}`;
 if(!canManageCustomers(role))redirect(`${target}?error=${encodeURIComponent("You do not have permission to generate service-plan jobs.")}`);
 const {data:plan}=await supabase.from("recurring_service_series").select("id,default_employee_id").eq("id",planId).eq("business_id",business.id).eq("customer_id",customerId).eq("status","active").maybeSingle();
 if(!plan)redirect(`${target}?error=${encodeURIComponent("The active service plan could not be found.")}`);
 const {error}=await supabase.rpc("generate_service_plan_jobs",{p_plan_id:plan.id,p_horizon_days:60});
 if(error){
  console.error("Service plan job generation retry failed",{businessId:business.id,customerId,planId,code:error.code,message:error.message,hint:error.hint,details:error.details});
  redirect(`${target}?reconcilePlan=${plan.id}&error=${encodeURIComponent(`Upcoming jobs still could not be generated. Reference code: ${error.code||"unknown"}.`)}`);
 }
 if(plan.default_employee_id){
  const {data:generatedJobs}=await supabase.from("jobs").select("id").eq("business_id",business.id).eq("recurring_service_series_id",plan.id).is("assigned_technician_id",null);
  for(const job of generatedJobs??[]){
   const {error:assignmentError}=await supabase.rpc("set_job_primary_technician",{p_job_id:job.id,p_technician_id:plan.default_employee_id});
   if(assignmentError)console.error("Retried service-plan job assignment failed",{businessId:business.id,planId,jobId:job.id,code:assignmentError.code});
  }
 }
 revalidatePath(target);revalidatePath(`/app/${slug}/jobs`);
 redirect(`${target}?success=${encodeURIComponent("Upcoming service-plan jobs generated successfully.")}`);
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
  revalidatePath(`/app/${slug}/customers/${customerId}`);
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
