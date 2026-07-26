export const qualificationTypes=["skill","certification","license"] as const;

export function validateQualification(input:{
 type:string;name:string;issuedOn:string|null;expiresOn:string|null;
}){
 if(!qualificationTypes.includes(input.type as typeof qualificationTypes[number]))return "Choose a valid qualification type.";
 if(!input.name.trim()||input.name.trim().length>150)return "Enter a qualification name up to 150 characters.";
 if(input.issuedOn&&input.expiresOn&&input.expiresOn<input.issuedOn)return "Expiration cannot be before the issue date.";
 return null;
}
