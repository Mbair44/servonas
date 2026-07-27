import type {EmployeeColumnMapping} from "./mapping";
export type ImportRowResult={normalizedValues:Record<string,string>;status:"ready"|"warning"|"error"|"ignored";errors:string[];warnings:string[]};
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phone=/^[+()\-\s.\d]{7,25}$/;
const date=/^\d{4}-\d{2}-\d{2}$/;
export function validateNormalizedEmployeeValues(values:Record<string,string>,initialWarnings:string[]=[]):Omit<ImportRowResult,"normalizedValues">{
 const errors:string[]=[];const warnings=[...initialWarnings];
 for(const key of Object.keys(values))values[key]=values[key].trim();
 if(values.email)values.email=values.email.toLowerCase();
 if(values.employee_type)values.employee_type=values.employee_type.toLowerCase().replace(/\s+/g,"_");
 if(values.employment_status)values.employment_status=values.employment_status.toLowerCase().replace(/\s+/g,"_");
 if(values.invite)values.invite=values.invite.toLowerCase();
 if(!values.first_name)errors.push("First name is required.");
 if(!values.last_name)errors.push("Last name is required.");
 if(values.email&&!email.test(values.email))errors.push("Enter a valid email address.");
 if(values.phone&&!phone.test(values.phone))errors.push("Enter a valid phone number.");
 if(values.employee_number&&values.employee_number.length>100)errors.push("Employee ID must be 100 characters or fewer.");
 if(values.start_date&&(!date.test(values.start_date)||Number.isNaN(Date.parse(`${values.start_date}T00:00:00Z`))))errors.push("Use YYYY-MM-DD for the start date.");
 if(values.employee_type&&!["technician","dispatcher","office_staff","sales","manager","owner","other"].includes(values.employee_type))errors.push(`“${values.employee_type}” is not a recognized employee type.`);
 if(values.employment_status&&!["active","inactive","leave","terminated"].includes(values.employment_status))errors.push(`“${values.employment_status}” is not a recognized employment status.`);
 if(values.invite&&!["yes","no","true","false","1","0"].includes(values.invite))errors.push("Invite must be Yes or No.");
 return {status:errors.length?"error":warnings.length?"warning":"ready",errors,warnings};
}
export function validateEmployeeImportRow(row:string[],mappings:EmployeeColumnMapping[]):ImportRowResult{
 const values:Record<string,string>={};const initialWarnings:string[]=[];
 for(const mapping of mappings)if(!mapping.isIgnored&&mapping.destinationField){
  const raw=(row[mapping.sourceOrdinal]??"").trim();
  if(mapping.destinationField==="full_name"&&mapping.transformation==="split_name"){
   const parts=raw.split(/\s+/).filter(Boolean);values.first_name=parts[0]??"";values.last_name=parts.slice(1).join(" ");
   if(parts.length!==2)initialWarnings.push("Review the automatic full-name split.");
  }else values[mapping.destinationField]=raw;
 }
 return {normalizedValues:values,...validateNormalizedEmployeeValues(values,initialWarnings)};
}
