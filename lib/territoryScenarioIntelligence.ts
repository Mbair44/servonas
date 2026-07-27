import {territoryContainsLocation,type TerritoryStatisticDefinition} from "./territoryStatistics.ts";

export type ImpactLocation={
 id:string;customerId:string;customerName:string;companyName?:string|null;tags:string[];
 latitude:number;longitude:number;postalCode?:string;city?:string;neighborhood?:string;
 recurring:boolean;upcomingAppointments:number;
};
export type CustomerImpact={
 locationId:string;customerId:string;customerName:string;companyName?:string|null;
 commercial:boolean;vip:boolean;recurring:boolean;upcomingAppointments:number;
 currentTerritories:string[];proposedTerritories:string[];change:"territory_changed"|"coverage_lost"|"coverage_gained";
};
export type TechnicianImpact={employeeId:string;employeeName:string;customersGained:number;customersLost:number;netCustomers:number;revenueResponsibility:null;weeklyWorkload:null;estimatedOvertime:null;driveTime:null;territoryGrowth:number;futureCapacity:null};
const matching=(definitions:TerritoryStatisticDefinition[],location:ImpactLocation)=>
 definitions.filter(item=>territoryContainsLocation(item,location)).map(item=>item.id).sort();
export function analyzeCustomerImpact(current:TerritoryStatisticDefinition[],proposed:TerritoryStatisticDefinition[],locations:ImpactLocation[]):CustomerImpact[]{
 return locations.flatMap(location=>{
  const before=matching(current,location),after=matching(proposed,location);
  if(before.join(",")===after.join(","))return [];
  return [{locationId:location.id,customerId:location.customerId,customerName:location.customerName,companyName:location.companyName,
   commercial:Boolean(location.companyName),vip:location.tags.some(tag=>tag.toLowerCase()==="vip"),recurring:location.recurring,
   upcomingAppointments:location.upcomingAppointments,currentTerritories:before,proposedTerritories:after,
   change:before.length&&!after.length?"coverage_lost":!before.length&&after.length?"coverage_gained":"territory_changed"} satisfies CustomerImpact];
 });
}
export function customerImpactCsv(rows:CustomerImpact[]){
 const quote=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
 return [["Customer","Company","VIP","Recurring","Upcoming appointments","Change"],...rows.map(row=>[
  row.customerName,row.companyName??"",row.vip,row.recurring,row.upcomingAppointments,row.change.replaceAll("_"," "),
 ])].map(row=>row.map(quote).join(",")).join("\n");
}
export function analyzeTechnicianImpact(rows:CustomerImpact[],assignments:Array<{territoryId:string;employeeId:string;employeeName:string}>):TechnicianImpact[]{
 const employees=new Map(assignments.map(item=>[item.employeeId,item.employeeName]));
 const territoryEmployee=new Map(assignments.map(item=>[item.territoryId,item.employeeId]));
 return [...employees].map(([employeeId,employeeName])=>{
  let customersGained=0,customersLost=0;
  for(const row of rows){
   const before=new Set(row.currentTerritories.map(id=>territoryEmployee.get(id)).filter(Boolean));
   const after=new Set(row.proposedTerritories.map(id=>territoryEmployee.get(id)).filter(Boolean));
   if(!before.has(employeeId)&&after.has(employeeId))customersGained++;
   if(before.has(employeeId)&&!after.has(employeeId))customersLost++;
  }
  return {employeeId,employeeName,customersGained,customersLost,netCustomers:customersGained-customersLost,
   revenueResponsibility:null,weeklyWorkload:null,estimatedOvertime:null,driveTime:null,
   territoryGrowth:customersGained-customersLost,futureCapacity:null};
 }).filter(item=>item.customersGained||item.customersLost);
}
