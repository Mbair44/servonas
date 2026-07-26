import Link from "next/link";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import { EmployeeForm } from "@/components/EmployeeForm";
import { createEmployee, setEmployeeActive } from "./workforceActions";
import { inviteTeamMember } from "./actions";

const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;
export default async function TeamPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageBusiness(role);
 const [{data:employees,error},{data:roles}]=await Promise.all([
  supabase.from("employees").select("id,preferred_name,legal_name,email,phone,employee_number,profile_photo_url,hire_date,termination_date,is_active,auth_user_id,employee_role_assignments!employee_roles_employee_tenant_fk(is_active,workforce_roles!employee_roles_role_tenant_fk(id,name))").eq("business_id",business.id).order("preferred_name"),
  supabase.from("workforce_roles").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
 ]);
 const search=(q.search??"").trim().toLowerCase(),status=q.status??"active",roleFilter=q.role??"";
 const visible=(employees??[]).filter(employee=>{
  const employeeRoles=(employee.employee_role_assignments??[]).filter((item:any)=>item.is_active).map((item:any)=>relation(item.workforce_roles));
  return (!search||[employee.preferred_name,employee.legal_name,employee.email,employee.employee_number].some(value=>String(value??"").toLowerCase().includes(search)))
   &&(status==="all"||(status==="active")===employee.is_active)
   &&(!roleFilter||employeeRoles.some((item:any)=>item?.id===roleFilter));
 });
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content workforce-page">
  <header className="epic3-header"><div><small>Workforce intelligence</small><h1>Team</h1><p>Understand who works here, what they do, and whether they are active.</p></div>{canEdit&&<a className="sv-button sv-secondary" href="#invite-employee">Invite employee</a>}</header>
  {q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}
  {error&&<div className="workspace-notice error">The workforce migration must be applied before Team can load.</div>}
  <section className="workforce-summary"><article><span>Active employees</span><strong>{(employees??[]).filter(item=>item.is_active).length}</strong></article><article><span>Inactive employees</span><strong>{(employees??[]).filter(item=>!item.is_active).length}</strong></article><article><span>Workforce roles</span><strong>{roles?.length??0}</strong></article></section>
  <section className="workspace-panel workforce-directory"><div className="panel-title"><div><span className="sv-kicker">Directory</span><h2>Employees</h2></div><span>{visible.length} shown</span></div>
   <form className="workforce-filters"><label>Search<input name="search" defaultValue={q.search??""} placeholder="Name, email, or employee #"/></label><label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></label><label>Role<select name="role" defaultValue={roleFilter}><option value="">All roles</option>{roles?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="sv-button sv-secondary">Filter</button></form>
   <div className="employee-grid">{visible.length?visible.map(employee=>{const employeeRoles=(employee.employee_role_assignments??[]).filter((item:any)=>item.is_active).map((item:any)=>relation(item.workforce_roles)).filter(Boolean);return <article key={employee.id} className={!employee.is_active?"inactive":""}><div className="employee-avatar">{employee.profile_photo_url?<img src={employee.profile_photo_url} alt=""/>:employee.preferred_name.slice(0,2).toUpperCase()}</div><div><Link href={`/app/${businessSlug}/team/${employee.id}`}><strong>{employee.preferred_name}</strong></Link><span>{employee.employee_number?`#${employee.employee_number} · `:""}{employee.email||employee.phone||"Contact not provided"}</span><div className="employee-role-pills">{employeeRoles.length?employeeRoles.map((item:any)=><em key={item.id}>{item.name}</em>):<em>No roles</em>}</div></div><div className="employee-card-actions"><span className={employee.is_active?"active":"inactive"}>{employee.is_active?"Active":"Inactive"}</span>{canEdit&&<form action={setEmployeeActive.bind(null,businessSlug,employee.id)}><input type="hidden" name="active" value={employee.is_active?"false":"true"}/><button className="text-button">{employee.is_active?"Deactivate":"Activate"}</button></form>}</div></article>}):<div className="dashboard-empty"><strong>No employees match these filters.</strong><p>Adjust the directory filters or add an employee.</p></div>}</div>
  </section>
  {canEdit&&<section className="workspace-panel workforce-quick-add" id="invite-employee"><div className="panel-title"><div><span className="sv-kicker">Account access</span><h2>Invite employee</h2><p>Send the existing secure workspace invitation. Accepted invitations automatically link to an employee record.</p></div></div><form action={inviteTeamMember.bind(null,businessSlug)} className="workforce-invite"><label>Email<input type="email" name="email" required placeholder="employee@example.com"/></label><label>Workspace access<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></label><button className="sv-button">Send invitation</button></form></section>}
  {canEdit&&<section className="workspace-panel workforce-quick-add"><div className="panel-title"><div><span className="sv-kicker">Under one minute</span><h2>Quick add employee</h2><p>Only a preferred name is required. Add roles and contact details when useful.</p></div></div><EmployeeForm action={createEmployee.bind(null,businessSlug)} roles={roles??[]} submitLabel="Add employee"/></section>}
 </section></main>;
}
