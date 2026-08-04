export const websiteTemplates=["modern","traditional","bold"] as const;
export type WebsiteTemplate=typeof websiteTemplates[number];
export const validWebsiteSlug=(value:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const validWebsiteColor=(value:string)=>/^#[0-9a-f]{6}$/i.test(value);
export function normalizeWebsiteDomain(value:string){
 if(!value.trim())return null;
 try{const url=new URL(value.includes("://")?value:`https://${value}`),hostname=url.hostname.toLowerCase().replace(/\.$/,"");return /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)?hostname:null;}catch{return null;}
}
export function normalizeWebsitePhone(value:string){
 const digits=value.replace(/\D/g,"");
 return digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith("1")?`+${digits}`:value.trim();
}
export function websiteRequestErrors(input:{name:string;phone:string;email:string;address:string;description:string;requestKey:string}){
 const errors:Record<string,string>={};
 if(!input.name||input.name.length>200)errors.name="Enter your name.";
 if(input.phone.replace(/\D/g,"").length<10)errors.phone="Enter a valid phone number.";
 if(input.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))errors.email="Enter a valid email address.";
 if(input.address.length<3||input.address.length>500)errors.address="Enter the service address.";
 if(input.description.length<3||input.description.length>4000)errors.description="Describe how the business can help.";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey))errors.form="Refresh the page and try again.";
 return errors;
}
