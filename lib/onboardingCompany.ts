export type OnboardingCompanyInput={name:string;displayName:string;slug:string;addressLine1:string;addressLine2:string;city:string;region:string;postalCode:string;country:string;phone:string;email:string;website:string;timezone:string};
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isIanaTimezone(value:string){
 try{new Intl.DateTimeFormat("en-US",{timeZone:value}).format();return value.includes("/");}catch{return false;}
}
export function validateOnboardingCompany(input:OnboardingCompanyInput){
 const errors:Partial<Record<keyof OnboardingCompanyInput,string>>={};
 if(input.name.trim().length<2||input.name.length>200)errors.name="Enter the company’s legal or operating name.";
 if(input.displayName.trim().length<2||input.displayName.length>120)errors.displayName="Enter the shorter name customers should see.";
 if(!slugPattern.test(input.slug))errors.slug="Use lowercase letters, numbers, and single hyphens.";
 if(!input.addressLine1||!input.city||!input.region||!input.postalCode)errors.addressLine1="Enter a complete business address.";
 if(!input.country)errors.country="Select a country.";
 if(!/^[+()\d.\-\s]{7,30}$/.test(input.phone))errors.phone="Enter a valid business phone number.";
 if(!emailPattern.test(input.email))errors.email="Enter a valid business email.";
 if(input.website){try{const url=new URL(input.website);if(!["http:","https:"].includes(url.protocol))throw new Error();}catch{errors.website="Enter a complete website URL beginning with https://";}}
 if(!isIanaTimezone(input.timezone))errors.timezone="Select a valid IANA time zone.";
 return errors;
}
