export const customerImportFields=[
 ["customer_name","Customer name"],["first_name","First name"],["last_name","Last name"],["company_name","Company"],["contact_name","Primary contact"],["email","Email"],["phone","Phone"],["status","Customer status"],["account_number","Account number"],["external_id","External customer ID"],
 ["service_address","Service street"],["service_address_2","Service unit"],["service_city","Service city"],["service_state","Service state"],["service_postal_code","Service ZIP"],["service_country","Service country"],["location_name","Location name"],["location_external_id","External location ID"],
 ["billing_address","Billing street"],["billing_address_2","Billing unit"],["billing_city","Billing city"],["billing_state","Billing state"],["billing_postal_code","Billing ZIP"],["billing_country","Billing country"],
 ["service_name","Recurring service"],["frequency","Frequency"],["next_service_date","Next service date"],["territory","Territory"],["assigned_technician","Assigned technician"],["notes","Notes"],
] as const;
export type CustomerImportField=(typeof customerImportFields)[number][0];
export type CustomerColumnMapping={sourceColumn:string;sourceOrdinal:number;destinationField:CustomerImportField|null;confidence:"exact"|"strong"|"possible"|"manual"|"unmatched";isIgnored:boolean};
const aliases:Record<CustomerImportField,string[]>={
 customer_name:["customer name","client name","account name"],first_name:["first name","firstname","given name"],last_name:["last name","lastname","surname"],company_name:["company","business name","company name"],contact_name:["contact name","primary contact","contact"],email:["email","email address","e-mail"],phone:["phone","phone number","mobile","cell","home phone","work phone"],status:["status","customer status","active"],account_number:["account number","account #","account no"],external_id:["customer id","external id","legacy id"],
 service_address:["service address","property address","location address","street","address","address 1"],service_address_2:["service address 2","unit","suite","address 2"],service_city:["service city","property city","city"],service_state:["service state","property state","state","province"],service_postal_code:["service zip","service zipcode","zip","zip code","postal code"],service_country:["service country","country"],location_name:["location name","property name","branch"],location_external_id:["location id","property id"],
 billing_address:["billing address","invoice address","billing street"],billing_address_2:["billing address 2","billing unit","billing suite"],billing_city:["billing city"],billing_state:["billing state","billing province"],billing_postal_code:["billing zip","billing zipcode","billing postal code"],billing_country:["billing country"],
 service_name:["service","service name","recurring service"],frequency:["frequency","cadence","service frequency"],next_service_date:["next service date","next date","next appointment"],territory:["territory","route"],assigned_technician:["assigned technician","technician","service tech"],notes:["notes","customer notes","comments"],
};
const clean=(value:string)=>value.toLowerCase().replace(/[_-]+/g," ").replace(/[^\p{L}\p{N} ]/gu,"").replace(/\s+/g," ").trim();
export function suggestCustomerImportMapping(header:string){
 const normalized=clean(header);for(const [field,values] of Object.entries(aliases) as [CustomerImportField,string[]][])if(values.includes(normalized))return {destinationField:field,confidence:values[0]===normalized?"exact" as const:"strong" as const};
 return {destinationField:null,confidence:"unmatched" as const};
}
export function validateCustomerMappings(mappings:CustomerColumnMapping[]){
 const destinations=mappings.flatMap(item=>item.destinationField?[item.destinationField]:[]);
 if(new Set(destinations).size!==destinations.length)return "Each destination field can be matched only once.";
 if(!destinations.some(field=>["customer_name","first_name","last_name","company_name","email","phone","external_id","account_number"].includes(field)))return "Match at least one customer identity field such as name, company, email, phone, account number, or external ID.";
 return null;
}
