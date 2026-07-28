import type{CustomerColumnMapping}from "./mapping";
export type ImportValues=Record<string,string>;
export const normalizeEmail=(value:string)=>value.trim().toLowerCase();
export const normalizePhone=(value:string)=>{const digits=value.replace(/\D/g,"");return digits.length===11&&digits.startsWith("1")?digits.slice(1):digits;};
export const normalizeText=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
export function mappedValues(row:string[],mappings:CustomerColumnMapping[]){return Object.fromEntries(mappings.filter(item=>item.destinationField&&!item.isIgnored).map(item=>[item.destinationField!,row[item.sourceOrdinal]?.trim()??""]));}
export function splitName(value:string){const parts=value.trim().split(/\s+/);return parts.length<2?{firstName:value.trim(),lastName:""}:{firstName:parts.slice(0,-1).join(" "),lastName:parts.at(-1)!};}
export function normalizeCustomerRow(values:ImportValues):ImportValues{
 const combined=splitName(values.customer_name??values.contact_name??"");
 return {...values,first_name:values.first_name||combined.firstName,last_name:values.last_name||combined.lastName,email:normalizeEmail(values.email??""),phone:normalizePhone(values.phone??""),status:normalizeText(values.status??"active")};
}
export function validateCustomerRow(values:ImportValues){
 const errors:string[]=[],warnings:string[]=[];
 if(![values.first_name,values.last_name,values.company_name].some(Boolean))errors.push("Add a customer or company name.");
 if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))errors.push("Enter a valid email address or remove it.");
 if(values.phone&&values.phone.length!==10)warnings.push("Review this phone number. Servonas could not normalize it to 10 digits.");
 const addressParts=[values.service_address,values.service_city,values.service_state,values.service_postal_code].filter(Boolean).length;
 if(addressParts>0&&addressParts<3)warnings.push("The service address is incomplete. Add street, city, state, and ZIP when available.");
 if(values.status&&!["active","inactive","current","former","yes","no","1","0"].includes(values.status))warnings.push(`Review the customer status “${values.status}.”`);
 return {errors,warnings,status:errors.length?"invalid":warnings.length?"warning":"ready"};
}
export function customerGroupKey(values:ImportValues,rowNumber:number){
 if(values.external_id)return`external:${normalizeText(values.external_id)}`;if(values.account_number)return`account:${normalizeText(values.account_number)}`;
 const name=normalizeText(values.company_name||`${values.first_name??""} ${values.last_name??""}`),email=normalizeEmail(values.email??""),phone=normalizePhone(values.phone??"");
 if(name&&email)return`email:${email}|${name}`;if(name&&phone)return`phone:${phone}|${name}`;
 const billing=normalizeText([values.billing_address,values.billing_address_2,values.billing_city,values.billing_state,values.billing_postal_code].filter(Boolean).join("|"));if(name&&billing)return`billing:${name}|${billing}`;
 return`row:${rowNumber}`;
}
export function locationGroupKey(values:ImportValues,rowNumber:number){if(values.location_external_id)return`external:${normalizeText(values.location_external_id)}`;const address=normalizeText([values.service_address,values.service_address_2,values.service_city,values.service_state,values.service_postal_code,values.service_country||"US"].join("|"));return address?`address:${address}`:`row:${rowNumber}`;}
