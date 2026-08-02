import type {IndustryProfile} from "./onboardingProfile";

export type IndustryCapability=
 |"equipmentTracking"|"maintenanceAgreements"|"emergencyCallWorkflows"
 |"poolChemistryTracking"|"poolServiceLogs"|"poolHealthAlerts"
 |"poolChemicalTracking"|"poolWeatherScheduling";

const CAPABILITIES:Partial<Record<IndustryProfile,readonly IndustryCapability[]>>={
 hvac:["equipmentTracking","maintenanceAgreements"],
 plumbing:["equipmentTracking","emergencyCallWorkflows"],
 pool_service:["poolChemistryTracking","poolServiceLogs","poolHealthAlerts","poolChemicalTracking","poolWeatherScheduling"],
};

export function industryCapabilities(industry:string|null|undefined){
 return new Set<IndustryCapability>(CAPABILITIES[industry as IndustryProfile]??[]);
}

export function hasIndustryCapability(industry:string|null|undefined,capability:IndustryCapability){
 return industryCapabilities(industry).has(capability);
}

export function requireIndustryCapability(industry:string|null|undefined,capability:IndustryCapability){
 if(!hasIndustryCapability(industry,capability))throw new Error("This feature is not available for this business type.");
}
