export type OnboardingServiceInput={name:string;description:string;durationMinutes:number;price:string;recurringAllowed:boolean;requiredSkills:string[];active:boolean};
export function normalizeSkills(value:string){return [...new Set(value.split(",").map(item=>item.trim()).filter(Boolean))].slice(0,20);}
export function validateOnboardingService(input:OnboardingServiceInput){
 const errors:{name?:string;description?:string;durationMinutes?:string;price?:string;requiredSkills?:string}={};
 if(input.name.trim().length<2||input.name.length>150)errors.name="Enter a service name between 2 and 150 characters.";
 if(input.description.length>2000)errors.description="Keep the description under 2,000 characters.";
 if(!Number.isInteger(input.durationMinutes)||input.durationMinutes<15||input.durationMinutes>1440)errors.durationMinutes="Duration must be between 15 minutes and 24 hours.";
 if(input.price&&!/^\d+(?:\.\d{1,2})?$/.test(input.price))errors.price="Enter a non-negative price with no more than two decimal places.";
 if(input.requiredSkills.some(skill=>skill.length>100))errors.requiredSkills="Each skill must be 100 characters or fewer.";
 return errors;
}
