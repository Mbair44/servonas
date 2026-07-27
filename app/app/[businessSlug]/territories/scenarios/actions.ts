"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {validateScenarioDetails} from "@/lib/territoryScenarios";
import {splitTerritoryValues} from "@/lib/workforceTerritories";
import {validateTerritoryGeometry,type TerritoryGeometry} from "@/lib/territoryMap";
const text=(formData:FormData,key:string)=>String(formData.get(key)??"").trim();
const path=(slug:string,kind:"success"|"error",message:string,scenarioId?:string)=>
 `/app/${slug}/territories/scenarios?${scenarioId?`scenario=${encodeURIComponent(scenarioId)}&`:""}${kind}=${encodeURIComponent(message)}`;

export async function createScenario(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can create scenarios."));
 const name=text(formData,"name"),description=text(formData,"description");
 const validationError=validateScenarioDetails(name,description);if(validationError)redirect(path(slug,"error",validationError));
 const {data,error}=await supabase.rpc("create_territory_scenario",{p_business_id:business.id,p_name:name,p_description:description||null});
 if(error){console.error("Territory scenario create failed",{businessId:business.id,code:error.code,message:error.message});redirect(path(slug,"error",error.code==="23505"?"A scenario with that name already exists.":"The scenario could not be created."));}
 revalidatePath(`/app/${slug}/territories/scenarios`);redirect(path(slug,"success","Scenario created.",data));
}
export async function renameScenario(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const id=text(formData,"scenarioId"),name=text(formData,"name"),description=text(formData,"description"),version=Number(text(formData,"version"));
 const validationError=validateScenarioDetails(name,description);if(validationError||!Number.isSafeInteger(version))redirect(path(slug,"error",validationError||"The scenario version is invalid.",id));
 const {data,error}=await supabase.from("territory_scenarios").update({name,description:description||null,updated_by:user.id,updated_at:new Date().toISOString(),version:version+1})
  .eq("business_id",business.id).eq("id",id).eq("version",version).is("deleted_at",null).select("id").maybeSingle();
 if(error){console.error("Territory scenario rename failed",{businessId:business.id,scenarioId:id,code:error.code});redirect(path(slug,"error",error.code==="23505"?"A scenario with that name already exists.":"The scenario could not be updated.",id));}
 if(!data)redirect(path(slug,"error","This scenario changed in another session. Refresh and try again.",id));
 revalidatePath(`/app/${slug}/territories/scenarios`);redirect(path(slug,"success","Scenario updated.",id));
}
export async function duplicateScenario(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const id=text(formData,"scenarioId"),name=text(formData,"name");
 const validationError=validateScenarioDetails(name,"");if(validationError)redirect(path(slug,"error",validationError,id));
 const {data,error}=await supabase.rpc("duplicate_territory_scenario",{p_business_id:business.id,p_scenario_id:id,p_name:name});
 if(error){console.error("Territory scenario duplicate failed",{businessId:business.id,scenarioId:id,code:error.code});redirect(path(slug,"error",error.code==="23505"?"A scenario with that name already exists.":"The scenario could not be duplicated.",id));}
 revalidatePath(`/app/${slug}/territories/scenarios`);redirect(path(slug,"success","Scenario duplicated.",data));
}
export async function setScenarioStatus(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const id=text(formData,"scenarioId"),status=text(formData,"status");
 if(!["draft","archived"].includes(status))redirect(path(slug,"error","Invalid scenario status.",id));
 const now=new Date().toISOString(),{error}=await supabase.from("territory_scenarios").update({status,archived_at:status==="archived"?now:null,updated_at:now,updated_by:user.id})
  .eq("business_id",business.id).eq("id",id).is("deleted_at",null);
 if(error){console.error("Territory scenario status failed",{businessId:business.id,scenarioId:id,code:error.code});redirect(path(slug,"error","The scenario status could not be changed.",id));}
 revalidatePath(`/app/${slug}/territories/scenarios`);redirect(path(slug,"success",status==="archived"?"Scenario archived.":"Scenario restored.",id));
}
export async function deleteScenario(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const id=text(formData,"scenarioId"),now=new Date().toISOString();
 const {error}=await supabase.from("territory_scenarios").update({deleted_at:now,updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("id",id).eq("status","archived").is("deleted_at",null);
 if(error){console.error("Territory scenario delete failed",{businessId:business.id,scenarioId:id,code:error.code});redirect(path(slug,"error","The archived scenario could not be deleted.",id));}
 revalidatePath(`/app/${slug}/territories/scenarios`);redirect(path(slug,"success","Scenario deleted."));
}
export async function updateScenarioTerritory(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const scenarioId=text(formData,"scenarioId"),id=text(formData,"scenarioTerritoryId"),version=Number(text(formData,"version"));
 const name=text(formData,"name"),boundary=text(formData,"boundaryGeojson");
 let currentStrategy:Record<string,unknown>={};
 try{currentStrategy=JSON.parse(text(formData,"strategyConfig")||"{}") as Record<string,unknown>;}catch{currentStrategy={};}
 let geometry:TerritoryGeometry|null=null;
 try{geometry=boundary?JSON.parse(boundary) as TerritoryGeometry:null;}catch{redirect(path(slug,"error","Boundary must contain valid GeoJSON.",scenarioId));}
 const geometryError=validateTerritoryGeometry(geometry);
 if(!name||name.length>150||!Number.isSafeInteger(version)||geometryError)redirect(path(slug,"error",geometryError||"Enter valid scenario territory details.",scenarioId));
 const cities=splitTerritoryValues(text(formData,"cities"));
 const {data,error}=await supabase.from("territory_scenario_territories").update({
  name,postal_codes:splitTerritoryValues(text(formData,"postalCodes")),
  neighborhoods:splitTerritoryValues(text(formData,"neighborhoods")),boundary_geojson:geometry,
  strategy_config:{...currentStrategy,cities},change_type:"modified",version:version+1,updated_at:new Date().toISOString(),
 }).eq("business_id",business.id).eq("scenario_id",scenarioId).eq("id",id).eq("version",version).select("id").maybeSingle();
 if(error){console.error("Scenario territory update failed",{businessId:business.id,scenarioId,scenarioTerritoryId:id,code:error.code});redirect(path(slug,"error","The scenario territory could not be updated.",scenarioId));}
 if(!data)redirect(path(slug,"error","This scenario territory changed in another session. Refresh and try again.",scenarioId));
 revalidatePath(`/app/${slug}/territories/scenarios`);redirect(path(slug,"success","Scenario recalculated.",scenarioId));
}
export async function setScenarioTerritoryRemoved(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Permission denied."));
 const scenarioId=text(formData,"scenarioId"),id=text(formData,"scenarioTerritoryId"),removed=text(formData,"removed")==="true";
 const {error}=await supabase.from("territory_scenario_territories").update({change_type:removed?"removed":"modified",updated_at:new Date().toISOString()})
  .eq("business_id",business.id).eq("scenario_id",scenarioId).eq("id",id);
 if(error){console.error("Scenario territory coverage toggle failed",{businessId:business.id,scenarioId,scenarioTerritoryId:id,code:error.code});redirect(path(slug,"error","The scenario territory could not be changed.",scenarioId));}
 revalidatePath(`/app/${slug}/territories/scenarios`);redirect(path(slug,"success",removed?"Territory removed from the scenario.":"Territory restored to the scenario.",scenarioId));
}
