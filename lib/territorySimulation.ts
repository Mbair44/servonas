import {territoryContainsLocation,type TerritoryStatisticDefinition} from "./territoryStatistics.ts";
export type SimulationLocation={
 id:string;customerId:string;latitude:number;longitude:number;postalCode?:string;city?:string;neighborhood?:string;
 recurringRevenueCents:number;jobsPerWeek:number;weeklyDriveMeters:number;weeklyDriveSeconds:number;
};
export type TerritorySimulation={
 customerCount:number;customersAffected:number;coverageGaps:number;recurringRevenueCents:number;
 jobsPerWeek:number;weeklyDriveMeters:number;weeklyDriveSeconds:number;routeDensity:number|null;
 technicianUtilization:null;estimatedFuelUsage:null;estimatedLaborSavings:null;
};
const memberships=(territories:TerritoryStatisticDefinition[],location:SimulationLocation)=>
 territories.filter(territory=>territoryContainsLocation(territory,location)).map(territory=>territory.id).sort();
export function simulateTerritories(live:TerritoryStatisticDefinition[],proposed:TerritoryStatisticDefinition[],locations:SimulationLocation[]):TerritorySimulation{
 const covered=locations.filter(location=>memberships(proposed,location).length>0);
 const affected=locations.filter(location=>memberships(live,location).join(",")!==memberships(proposed,location).join(","));
 const customers=new Set(covered.map(location=>location.customerId));
 return {
  customerCount:customers.size,customersAffected:new Set(affected.map(location=>location.customerId)).size,
  coverageGaps:new Set(locations.filter(location=>memberships(proposed,location).length===0).map(location=>location.customerId)).size,
  recurringRevenueCents:covered.reduce((sum,item)=>sum+item.recurringRevenueCents,0),
  jobsPerWeek:Number(covered.reduce((sum,item)=>sum+item.jobsPerWeek,0).toFixed(1)),
  weeklyDriveMeters:Math.round(covered.reduce((sum,item)=>sum+item.weeklyDriveMeters,0)),
  weeklyDriveSeconds:Math.round(covered.reduce((sum,item)=>sum+item.weeklyDriveSeconds,0)),
  routeDensity:proposed.length?Number((covered.reduce((sum,item)=>sum+item.jobsPerWeek,0)/proposed.length).toFixed(1)):null,
  technicianUtilization:null,estimatedFuelUsage:null,estimatedLaborSavings:null,
 };
}
