export type MappingConfidence="exact"|"high"|"medium"|"manual"|"unmatched";
export type EmployeeImportDestination={
  value:string;label:string;required?:boolean;aliases:readonly string[];
};

export const employeeImportDestinations:readonly EmployeeImportDestination[]=[
  {value:"first_name",label:"First name",required:true,aliases:["first name","firstname","given name","employee first name","first"]},
  {value:"last_name",label:"Last name",required:true,aliases:["last name","lastname","surname","family name","employee last name","last"]},
  {value:"full_name",label:"Full name",aliases:["full name","fullname","employee name","name"]},
  {value:"preferred_name",label:"Preferred name",aliases:["preferred name","display name","nickname"]},
  {value:"email",label:"Email",aliases:["email","email address","work email","employee email","e-mail"]},
  {value:"phone",label:"Phone",aliases:["phone","phone number","mobile","mobile phone","cell","cell phone"]},
  {value:"employee_number",label:"Employee ID",aliases:["employee id","employee number","employee no","staff id","worker id","external id"]},
  {value:"job_title",label:"Job title",aliases:["job title","title","position"]},
  {value:"role",label:"Role",aliases:["role","primary role","workforce role"]},
  {value:"employee_type",label:"Employee type",aliases:["employee type","worker type","staff type","category"]},
  {value:"start_date",label:"Start date",aliases:["start date","hire date","hired date","date hired"]},
  {value:"employment_status",label:"Employment status",aliases:["status","employment status","employee status"]},
  {value:"manager",label:"Manager",aliases:["manager","manager email","manager id","manager email/id","manager email or id","reports to","supervisor"]},
  {value:"location",label:"Location",aliases:["location","primary location","home location","branch","office"]},
  {value:"territory",label:"Territory",aliases:["territory","service area","region"]},
  {value:"skills",label:"Skills",aliases:["skills","skill","qualifications","certifications"]},
  {value:"invite",label:"Invite",aliases:["invite","send invite","invitation","invite now","login access"]},
  {value:"notes",label:"Notes",aliases:["notes","comments","employee notes"]},
] as const;

export const normalizeMappingHeader=(value:string)=>value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"");

export function suggestEmployeeImportMapping(sourceColumn:string){
  const normalized=normalizeMappingHeader(sourceColumn);
  for(const field of employeeImportDestinations){
    const canonical=normalizeMappingHeader(field.label);
    if(normalized===canonical) return {destinationField:field.value,confidence:"exact" as const,transformation:field.value==="full_name"?"split_name":"none"};
    if(field.aliases.some(alias=>normalizeMappingHeader(alias)===normalized)) return {destinationField:field.value,confidence:"high" as const,transformation:field.value==="full_name"?"split_name":"none"};
  }
  const partial=employeeImportDestinations.find(field=>field.aliases.some(alias=>{
    const candidate=normalizeMappingHeader(alias);
    return normalized.length>=6&&(normalized.includes(candidate)||candidate.includes(normalized));
  }));
  return partial
    ? {destinationField:partial.value,confidence:"medium" as const,transformation:partial.value==="full_name"?"split_name":"none"}
    : {destinationField:null,confidence:"unmatched" as const,transformation:"none"};
}

export type EmployeeColumnMapping={
  sourceColumn:string;sourceOrdinal:number;destinationField:string|null;
  transformation:string;confidence:MappingConfidence;isIgnored:boolean;
};

export function validateEmployeeColumnMappings(mappings:EmployeeColumnMapping[]){
  const selected=mappings.filter(mapping=>!mapping.isIgnored&&mapping.destinationField);
  const destinations=selected.map(mapping=>mapping.destinationField!);
  const duplicate=destinations.find((field,index)=>destinations.indexOf(field)!==index);
  if(duplicate){
    const label=employeeImportDestinations.find(field=>field.value===duplicate)?.label??duplicate;
    return `${label} is mapped more than once. Choose one source column or ignore the duplicate.`;
  }
  const hasStructured=destinations.includes("first_name")&&destinations.includes("last_name");
  const fullName=selected.find(mapping=>mapping.destinationField==="full_name"&&mapping.transformation==="split_name");
  if(!hasStructured&&!fullName) return "Map both First name and Last name, or map a Full name column using name splitting.";
  return null;
}

export function previewFullNameSplit(value:string){
  const parts=value.trim().split(/\s+/).filter(Boolean);
  if(parts.length<2) return {firstName:parts[0]??"",lastName:"",reliable:false};
  return {firstName:parts[0],lastName:parts.slice(1).join(" "),reliable:parts.length===2};
}
