type Role={id:string;name:string};
type Employee={preferred_name?:string;legal_name?:string|null;email?:string|null;phone?:string|null;employee_number?:string|null;profile_photo_url?:string|null;hire_date?:string|null;termination_date?:string|null;notes?:string|null;is_active?:boolean};
export function EmployeeForm({action,roles,employee={},selectedRoleIds=[],submitLabel}:{action:(formData:FormData)=>void|Promise<void>;roles:Role[];employee?:Employee;selectedRoleIds?:string[];submitLabel:string}){
 return <form action={action} className="employee-form"><fieldset><legend>Employee profile</legend>
  <label>Preferred name<input required maxLength={200} name="preferredName" defaultValue={employee.preferred_name??""}/></label>
  <label>Legal name<input maxLength={200} name="legalName" defaultValue={employee.legal_name??""}/></label>
  <label>Email<input type="email" name="email" defaultValue={employee.email??""}/></label>
  <label>Phone<input name="phone" autoComplete="tel" defaultValue={employee.phone??""}/></label>
  <label>Employee number<input name="employeeNumber" defaultValue={employee.employee_number??""}/></label>
  <label>Profile photo URL<input type="url" name="profilePhotoUrl" placeholder="https://…" defaultValue={employee.profile_photo_url??""}/></label>
  <label>Hire date<input type="date" name="hireDate" defaultValue={employee.hire_date??""}/></label>
  <label>Termination date<input type="date" name="terminationDate" defaultValue={employee.termination_date??""}/></label>
  <label className="employee-active"><input type="checkbox" name="isActive" defaultChecked={employee.is_active??true}/> Active employee</label>
  <label className="employee-notes">Notes<textarea name="notes" rows={4} maxLength={5000} defaultValue={employee.notes??""}/></label>
 </fieldset><fieldset className="employee-roles"><legend>Workforce roles</legend>{roles.map(role=><label key={role.id}><input type="checkbox" name="roleIds" value={role.id} defaultChecked={selectedRoleIds.includes(role.id)}/>{role.name}</label>)}</fieldset>
 <button className="sv-button">{submitLabel}</button></form>;
}
