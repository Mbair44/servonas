"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageCustomers} from "@/lib/access";
import {requireWorkspaceCapability} from "@/lib/workspace";
import {hasIndustryCapability} from "@/lib/industryCapabilities";

const equipmentTypes=["central_air","heat_pump","furnace","mini_split","air_handler","package_unit","boiler","thermostat","evaporative_cooler","other"];
const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const path=(slug:string,customerId:string,kind:"success"|"error",message:string)=>`/app/${slug}/customers/${customerId}?${kind}=${encodeURIComponent(message)}#hvac-equipment`;

async function context(slug:string,customerId:string){
 const workspace=await requireWorkspaceCapability(slug,"customer_management");
 if(!hasIndustryCapability(workspace.business.industry_profile,"equipmentTracking")||workspace.business.industry_profile!=="hvac")redirect(path(slug,customerId,"error","HVAC equipment is available only for HVAC workspaces."));
 if(!canManageCustomers(workspace.role))redirect(path(slug,customerId,"error","You do not have permission to manage customer equipment."));
 const {data:customer}=await workspace.supabase.from("customers").select("id").eq("business_id",workspace.business.id).eq("id",customerId).eq("is_deleted",false).maybeSingle();
 if(!customer)redirect(path(slug,customerId,"error","Customer not found."));
 return workspace;
}

function values(data:FormData){
 const equipmentType=text(data,"equipmentType"),name=text(data,"name");
 const yearValue=text(data,"modelYear"),capacityValue=text(data,"capacityTons");
 const modelYear=yearValue?Number(yearValue):null,capacityTons=capacityValue?Number(capacityValue):null;
 if(!equipmentTypes.includes(equipmentType)||!name||name.length>150)throw new Error("Enter an equipment name and choose a valid system type.");
 if(modelYear!==null&&(!Number.isInteger(modelYear)||modelYear<1900||modelYear>2200))throw new Error("Enter a valid four-digit model year.");
 if(capacityTons!==null&&(!Number.isFinite(capacityTons)||capacityTons<=0||capacityTons>100))throw new Error("Enter a valid system capacity.");
 return {equipment_type:equipmentType,name,manufacturer:text(data,"manufacturer")||null,model:text(data,"model")||null,serial_number:text(data,"serialNumber")||null,model_year:modelYear,capacity_tons:capacityTons,fuel_type:text(data,"fuelType")||null,refrigerant_type:text(data,"refrigerantType")||null,filter_size:text(data,"filterSize")||null,installed_on:text(data,"installedOn")||null,warranty_expires_on:text(data,"warrantyExpiresOn")||null,notes:text(data,"notes")||null,service_location_id:text(data,"serviceLocationId")||null};
}

export async function createCustomerHvacEquipment(slug:string,customerId:string,data:FormData){
 const {supabase,business,user}=await context(slug,customerId);
 let payload;try{payload=values(data);}catch(error){redirect(path(slug,customerId,"error",error instanceof Error?error.message:"Review the equipment details."));}
 const {error}=await supabase.from("customer_hvac_equipment").insert({...payload,business_id:business.id,customer_id:customerId,created_by:user.id,updated_by:user.id});
 if(error){console.error("Customer HVAC equipment creation failed",{businessId:business.id,customerId,code:error.code});redirect(path(slug,customerId,"error",error.code==="42P01"||error.code==="PGRST205"?"Apply the customer HVAC equipment migration, then try again.":"The equipment could not be added."));}
 revalidatePath(`/app/${slug}/customers/${customerId}`);redirect(path(slug,customerId,"success","HVAC equipment added."));
}

export async function updateCustomerHvacEquipment(slug:string,customerId:string,equipmentId:string,data:FormData){
 const {supabase,business,user}=await context(slug,customerId);
 let payload;try{payload=values(data);}catch(error){redirect(path(slug,customerId,"error",error instanceof Error?error.message:"Review the equipment details."));}
 const {error}=await supabase.from("customer_hvac_equipment").update({...payload,updated_by:user.id}).eq("business_id",business.id).eq("customer_id",customerId).eq("id",equipmentId);
 if(error){console.error("Customer HVAC equipment update failed",{businessId:business.id,customerId,equipmentId,code:error.code});redirect(path(slug,customerId,"error","The equipment could not be updated."));}
 revalidatePath(`/app/${slug}/customers/${customerId}`);redirect(path(slug,customerId,"success","HVAC equipment updated."));
}

export async function archiveCustomerHvacEquipment(slug:string,customerId:string,equipmentId:string){
 const {supabase,business,user}=await context(slug,customerId);
 const {error}=await supabase.from("customer_hvac_equipment").update({is_active:false,updated_by:user.id}).eq("business_id",business.id).eq("customer_id",customerId).eq("id",equipmentId);
 if(error)redirect(path(slug,customerId,"error","The equipment could not be removed."));
 revalidatePath(`/app/${slug}/customers/${customerId}`);redirect(path(slug,customerId,"success","HVAC equipment removed."));
}
