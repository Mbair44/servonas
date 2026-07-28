export type DuplicateEmployee={id:string;first_name?:string|null;last_name?:string|null;email?:string|null;phone?:string|null;employee_number?:string|null;hire_date?:string|null};
export type DuplicateResult={matchType:"none"|"possible"|"definite";reason:string|null;existingEmployeeId:string|null;resolution:"create"|"skip"};
const text=(value:unknown)=>String(value??"").trim().toLowerCase();
const phone=(value:unknown)=>String(value??"").replace(/\D/g,"");
export function findEmployeeDuplicate(values:Record<string,string>,employees:DuplicateEmployee[]):DuplicateResult{
 const employeeNumber=text(values.employee_number),email=text(values.email),normalizedPhone=phone(values.phone);
 const fullName=`${text(values.first_name)} ${text(values.last_name)}`.trim();
 if(employeeNumber){const match=employees.find(employee=>text(employee.employee_number)===employeeNumber);if(match)return{matchType:"definite",reason:"Exact employee ID",existingEmployeeId:match.id,resolution:"skip"};}
 if(email){const match=employees.find(employee=>text(employee.email)===email);if(match)return{matchType:"definite",reason:"Exact email address",existingEmployeeId:match.id,resolution:"skip"};}
 if(normalizedPhone.length>=7){const match=employees.find(employee=>phone(employee.phone)===normalizedPhone&&`${text(employee.first_name)} ${text(employee.last_name)}`.trim()===fullName);if(match)return{matchType:"possible",reason:"Same name and phone number",existingEmployeeId:match.id,resolution:"skip"};}
 if(fullName&&values.start_date){const match=employees.find(employee=>`${text(employee.first_name)} ${text(employee.last_name)}`.trim()===fullName&&employee.hire_date===values.start_date);if(match)return{matchType:"possible",reason:"Same name and start date",existingEmployeeId:match.id,resolution:"skip"};}
 return{matchType:"none",reason:null,existingEmployeeId:null,resolution:"create"};
}
