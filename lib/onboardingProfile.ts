export const OPERATING_MODELS=["route_service","appointment_service","rental_inventory","project_service"] as const;
export const INDUSTRY_PROFILES=["pest_control","lawn_care","pool_service","hvac","plumbing","electrical","junk_removal","party_rental","equipment_rental","other"] as const;
export type OperatingModel=typeof OPERATING_MODELS[number];
export type IndustryProfile=typeof INDUSTRY_PROFILES[number];
export type BusinessProfileInput={operatingModel:string;industryProfile:string;otherIndustry:string};
export function validateBusinessProfile(input:BusinessProfileInput){
 const errors:{operatingModel?:string;industryProfile?:string;otherIndustry?:string}={};
 if(!OPERATING_MODELS.includes(input.operatingModel as OperatingModel))errors.operatingModel="Choose the operating model closest to how work is delivered.";
 if(!INDUSTRY_PROFILES.includes(input.industryProfile as IndustryProfile))errors.industryProfile="Choose an industry profile.";
 if(input.industryProfile==="other"&&(input.otherIndustry.trim().length<2||input.otherIndustry.length>100))errors.otherIndustry="Tell us what kind of service business you operate.";
 return errors;
}
export function suggestedProfileDefaults(industry:string){
 const suggestions:Record<string,{serviceName:string;durationMinutes:number;recurringAllowed:boolean}>={
  pest_control:{serviceName:"General pest service",durationMinutes:60,recurringAllowed:true},
  lawn_care:{serviceName:"Lawn maintenance",durationMinutes:60,recurringAllowed:true},
  pool_service:{serviceName:"Pool service",durationMinutes:45,recurringAllowed:true},
  hvac:{serviceName:"HVAC service call",durationMinutes:90,recurringAllowed:false},
  plumbing:{serviceName:"Plumbing service call",durationMinutes:90,recurringAllowed:false},
  electrical:{serviceName:"Electrical service call",durationMinutes:90,recurringAllowed:false},
  junk_removal:{serviceName:"Junk removal quote",durationMinutes:90,recurringAllowed:false},
  party_rental:{serviceName:"Event rental",durationMinutes:60,recurringAllowed:false},
  equipment_rental:{serviceName:"Equipment rental",durationMinutes:60,recurringAllowed:false},
 };
 return suggestions[industry]??{serviceName:"Service call",durationMinutes:60,recurringAllowed:false};
}
