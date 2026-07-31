"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspaceCapability} from "@/lib/workspace";

const text=(formData:FormData,key:string)=>String(formData.get(key)??"").trim();
const optional=(formData:FormData,key:string)=>text(formData,key)||null;
const numberOrNull=(formData:FormData,key:string)=>{const value=text(formData,key);return value===""?null:Number(value);};
const path=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/equipment?${kind}=${encodeURIComponent(message)}`;

export async function createEquipment(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can add equipment."));
 const name=text(formData,"name"),assetType=text(formData,"assetType"),condition=text(formData,"condition"),modelYear=numberOrNull(formData,"modelYear"),odometer=numberOrNull(formData,"odometerMiles");
 if(!name||!["vehicle","trailer","equipment","tablet","key","safety_equipment","other"].includes(assetType)||!["new","good","fair","poor","out_of_service"].includes(condition)||modelYear!==null&&(!Number.isInteger(modelYear)||modelYear<1900||modelYear>2200)||odometer!==null&&(!Number.isInteger(odometer)||odometer<0))redirect(path(slug,"error","Review the equipment name, type, year, condition, and mileage."));
 const {error}=await supabase.from("workforce_assets").insert({business_id:business.id,name,asset_type:assetType,condition,status:condition==="out_of_service"?"maintenance":"available",asset_number:optional(formData,"assetNumber"),serial_number:optional(formData,"serialNumber"),manufacturer:optional(formData,"manufacturer"),model:optional(formData,"model"),model_year:modelYear,license_plate:optional(formData,"licensePlate"),vin:optional(formData,"vin"),odometer_miles:odometer,registration_expires_on:optional(formData,"registrationExpiresOn"),insurance_expires_on:optional(formData,"insuranceExpiresOn"),next_service_on:optional(formData,"nextServiceOn"),next_service_odometer_miles:numberOrNull(formData,"nextServiceOdometerMiles"),notes:optional(formData,"notes"),created_by:user.id,updated_by:user.id});
 if(error){console.error("Equipment creation failed",{businessId:business.id,code:error.code});redirect(path(slug,"error",error.code==="23505"?"That asset number, serial number, plate, or VIN is already in use.":"The equipment record could not be created. Apply the fleet migration first."));}
 revalidatePath(`/app/${slug}/equipment`);redirect(path(slug,"success","Equipment added."));
}

export async function updateEquipment(slug:string,assetId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can update equipment."));
 const odometer=numberOrNull(formData,"odometerMiles"),nextOdometer=numberOrNull(formData,"nextServiceOdometerMiles"),status=text(formData,"status"),condition=text(formData,"condition");
 if(odometer!==null&&(!Number.isInteger(odometer)||odometer<0)||nextOdometer!==null&&(!Number.isInteger(nextOdometer)||nextOdometer<0)||!["available","assigned","maintenance","retired","lost"].includes(status)||!["new","good","fair","poor","out_of_service"].includes(condition))redirect(path(slug,"error","Review the fleet status, condition, and mileage."));
 const {data:activeAssignment}=await supabase.from("employee_asset_assignments").select("id").eq("business_id",business.id).eq("asset_id",assetId).is("returned_at",null).maybeSingle();
 if(activeAssignment&&!["assigned","maintenance"].includes(status))redirect(path(slug,"error","Return the equipment before marking it available, retired, or lost."));
 if(!activeAssignment&&status==="assigned")redirect(path(slug,"error","Use Assign to employee before marking equipment assigned."));
 const {error}=await supabase.from("workforce_assets").update({odometer_miles:odometer,registration_expires_on:optional(formData,"registrationExpiresOn"),insurance_expires_on:optional(formData,"insuranceExpiresOn"),last_service_on:optional(formData,"lastServiceOn"),next_service_on:optional(formData,"nextServiceOn"),next_service_odometer_miles:nextOdometer,gps_device_id:optional(formData,"gpsDeviceId"),status,condition,notes:optional(formData,"notes"),updated_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id).eq("id",assetId);
 if(error){console.error("Equipment update failed",{businessId:business.id,assetId,code:error.code});redirect(path(slug,"error","The equipment record could not be updated."));}
 revalidatePath(`/app/${slug}/equipment`);redirect(path(slug,"success","Equipment details saved."));
}

export async function assignEquipment(slug:string,assetId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can assign equipment."));
 const employeeId=text(formData,"employeeId");if(!employeeId)redirect(path(slug,"error","Choose an employee."));
 const {error}=await supabase.rpc("assign_workforce_asset",{p_business_id:business.id,p_employee_id:employeeId,p_asset_id:assetId,p_expected_return_at:optional(formData,"expectedReturnAt"),p_assignment_notes:text(formData,"assignmentNotes")});
 if(error)redirect(path(slug,"error",error.code==="23505"?"That equipment is already assigned.":"The equipment could not be assigned."));
 revalidatePath(`/app/${slug}/equipment`);revalidatePath(`/app/${slug}/team/${employeeId}`);redirect(path(slug,"success","Equipment assigned."));
}

export async function returnEquipment(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can return equipment."));
 const {error}=await supabase.rpc("return_workforce_asset",{p_business_id:business.id,p_assignment_id:text(formData,"assignmentId"),p_return_condition:text(formData,"returnCondition"),p_return_notes:text(formData,"returnNotes")});
 if(error)redirect(path(slug,"error","The equipment return could not be recorded."));
 revalidatePath(`/app/${slug}/equipment`);redirect(path(slug,"success","Equipment returned."));
}

export async function addMaintenanceEvent(slug:string,assetId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"team_management");
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can record maintenance."));
 const title=text(formData,"title"),eventType=text(formData,"eventType"),status=text(formData,"maintenanceStatus"),odometer=numberOrNull(formData,"maintenanceOdometer"),cost=numberOrNull(formData,"cost");
 if(!title||!["inspection","preventive_service","repair","tire_service","registration","insurance","other"].includes(eventType)||!["scheduled","in_progress","completed","canceled"].includes(status)||odometer!==null&&odometer<0||cost!==null&&cost<0)redirect(path(slug,"error","Review the maintenance details."));
 const completedOn=status==="completed"?(optional(formData,"completedOn")??new Date().toISOString().slice(0,10)):null;
 const {error}=await supabase.from("workforce_asset_maintenance_events").insert({business_id:business.id,asset_id:assetId,event_type:eventType,status,title,description:optional(formData,"description"),service_provider:optional(formData,"serviceProvider"),scheduled_for:optional(formData,"scheduledFor"),completed_on:completedOn,odometer_miles:odometer,cost,created_by:user.id});
 if(error){console.error("Fleet maintenance event failed",{businessId:business.id,assetId,code:error.code});redirect(path(slug,"error","Maintenance could not be recorded. Apply the fleet migration first."));}
 if(status==="completed")await supabase.from("workforce_assets").update({last_service_on:completedOn,odometer_miles:odometer??undefined,updated_by:user.id}).eq("business_id",business.id).eq("id",assetId);
 revalidatePath(`/app/${slug}/equipment`);redirect(path(slug,"success","Maintenance event recorded."));
}
