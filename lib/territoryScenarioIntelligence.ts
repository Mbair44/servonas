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
export type FinancialImpact={recurringRevenueCoveredDifferenceCents:number;weeklyDriveMetersDifference:number;weeklyDriveSecondsDifference:number;fuelSavingsCents:null;laborSavingsCents:null;additionalAppointmentCapacity:null;truckUtilization:null};
export type ScenarioDecision={summary:string[];reasons:string[];recommendation:"beneficial"|"mixed"|"needs_attention"|"no_material_change";recommendationText:string};
export type ScenarioScoreCategory={key:string;label:string;weight:number;score:number|null;explanation:string};
export type ScenarioScore={score:number|null;categories:ScenarioScoreCategory[];scoredWeight:number};
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
export function analyzeFinancialImpact(current:{recurringRevenueCents:number;weeklyDriveMeters:number;weeklyDriveSeconds:number},proposed:{recurringRevenueCents:number;weeklyDriveMeters:number;weeklyDriveSeconds:number}):FinancialImpact{
 return {recurringRevenueCoveredDifferenceCents:proposed.recurringRevenueCents-current.recurringRevenueCents,
  weeklyDriveMetersDifference:proposed.weeklyDriveMeters-current.weeklyDriveMeters,
  weeklyDriveSecondsDifference:proposed.weeklyDriveSeconds-current.weeklyDriveSeconds,
  fuelSavingsCents:null,laborSavingsCents:null,additionalAppointmentCapacity:null,truckUtilization:null};
}
export function explainScenario(input:{changedTerritories:number;customerImpact:CustomerImpact[];financial:FinancialImpact}):ScenarioDecision{
 const lost=input.customerImpact.filter(item=>item.change==="coverage_lost").length;
 const gained=input.customerImpact.filter(item=>item.change==="coverage_gained").length;
 const summary=[`${input.changedTerritories} territory definition${input.changedTerritories===1?"":"s"} changed`,`${input.customerImpact.length} customer location${input.customerImpact.length===1?"":"s"} affected`];
 const reasons=[lost?`${lost} customer location${lost===1?" is":"s are"} left without coverage.`:"No customer coverage is lost.",
  input.financial.weeklyDriveSecondsDifference<0?`Measured weekly drive time is ${Math.round(Math.abs(input.financial.weeklyDriveSecondsDifference)/60)} minutes lower.`:"No measured drive-time improvement is demonstrated.",
  gained?`${gained} previously uncovered location${gained===1?" gains":"s gain"} coverage.`:"No new customer coverage is added."];
 const recommendation=lost?"needs_attention":input.financial.weeklyDriveSecondsDifference<0||gained?"beneficial":input.customerImpact.length?"mixed":"no_material_change";
 return {summary,reasons,recommendation,recommendationText:recommendation==="beneficial"?"The measurable changes appear beneficial. Review customer and technician impacts before approval.":recommendation==="needs_attention"?"Resolve coverage gaps before approving this scenario.":recommendation==="mixed"?"The scenario has tradeoffs. Review the measured impacts before deciding.":"No material operational change is currently measured."};
}
export function scoreScenario(input:{currentDriveSeconds:number;proposedDriveSeconds:number;affectedCustomers:number;totalCustomers:number;coverageGaps:number;currentDensity:number|null;proposedDensity:number|null}):ScenarioScore{
 const ratio=(before:number,after:number)=>before>0?Math.max(0,Math.min(100,50+((before-after)/before)*100)):50;
 const categories:ScenarioScoreCategory[]=[
  {key:"drive",label:"Drive efficiency",weight:30,score:ratio(input.currentDriveSeconds,input.proposedDriveSeconds),explanation:"Compares measured weekly drive seconds; lower is better."},
  {key:"balance",label:"Workload balance",weight:25,score:null,explanation:"Requires authoritative per-technician capacity and scenario assignments."},
  {key:"disruption",label:"Customer disruption",weight:20,score:input.totalCustomers?Math.max(0,100-(input.affectedCustomers/input.totalCustomers)*100):100,explanation:"Rewards scenarios that move fewer customer locations."},
  {key:"compactness",label:"Territory compactness",weight:15,score:input.currentDensity!==null&&input.proposedDensity!==null?ratio(input.currentDensity,Math.max(0,input.currentDensity-(input.proposedDensity-input.currentDensity))):null,explanation:"Uses jobs per territory as a density proxy; a geometric compactness model is not claimed."},
  {key:"growth",label:"Growth capacity",weight:10,score:input.coverageGaps?0:100,explanation:"Requires zero uncovered customer locations; future hiring capacity is not inferred."},
 ];
 const scored=categories.filter(item=>item.score!==null),scoredWeight=scored.reduce((sum,item)=>sum+item.weight,0);
 return {score:scoredWeight?Math.round(scored.reduce((sum,item)=>sum+(item.score??0)*item.weight,0)/scoredWeight):null,categories,scoredWeight};
}
