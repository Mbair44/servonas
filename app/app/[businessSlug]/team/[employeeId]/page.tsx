import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { EmployeeForm } from "@/components/EmployeeForm";
import { EmployeeAvailability } from "@/components/EmployeeAvailability";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { addEmployeeAvailabilityException, deleteEmployeeAvailabilityException, saveEmployeeAvailability, updateEmployee } from "../workforceActions";
export default async function EmployeePage({params,searchParams}:{params:Promise<{businessSlug:string;employeeId:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug,employeeId}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageBusiness(role);
 const [{data:employee},{data:roles},{data:assignments},{data:availability},{data:intervals},{data:exceptions}]=await Promise.all([
  supabase.from("employees").select("*").eq("business_id",business.id).eq("id",employeeId).maybeSingle(),
  supabase.from("workforce_roles").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
  supabase.from("employee_role_assignments").select("workforce_role_id").eq("business_id",business.id).eq("employee_id",employeeId).eq("is_active",true),
  supabase.from("employee_availability_profiles").select("time_zone,maximum_daily_jobs,maximum_daily_minutes,overtime_preference").eq("business_id",business.id).eq("employee_id",employeeId).maybeSingle(),
  supabase.from("employee_weekly_intervals").select("id,weekday,interval_type,starts_at,ends_at").eq("business_id",business.id).eq("employee_id",employeeId).order("weekday").order("starts_at"),
  supabase.from("employee_availability_exceptions").select("id,exception_type,starts_at,ends_at,availability_effect,approval_status,reason").eq("business_id",business.id).eq("employee_id",employeeId).neq("approval_status","cancelled").gte("ends_at",new Date().toISOString()).order("starts_at"),
 ]);if(!employee)notFound();
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content workforce-page"><header className="epic3-header"><div><small>Employee profile</small><h1>{employee.preferred_name}</h1><p>{employee.is_active?"Active team member":"Inactive team member"}</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team`}>Back to Team</Link></header>{q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}<section className="workspace-panel">{canEdit?<EmployeeForm action={updateEmployee.bind(null,businessSlug,employeeId)} roles={roles??[]} employee={employee} selectedRoleIds={(assignments??[]).map(item=>item.workforce_role_id)} submitLabel="Save employee"/>:<dl className="crm-summary"><div><dt>Legal name</dt><dd>{employee.legal_name||"Not provided"}</dd></div><div><dt>Email</dt><dd>{employee.email||"Not provided"}</dd></div><div><dt>Phone</dt><dd>{employee.phone||"Not provided"}</dd></div><div><dt>Employee number</dt><dd>{employee.employee_number||"Not provided"}</dd></div></dl>}</section>{availability?<EmployeeAvailability profile={availability} intervals={intervals??[]} exceptions={exceptions??[]} canEdit={canEdit} saveAction={saveEmployeeAvailability.bind(null,businessSlug,employeeId)} addExceptionAction={addEmployeeAvailabilityException.bind(null,businessSlug,employeeId)} deleteExceptionAction={deleteEmployeeAvailabilityException.bind(null,businessSlug,employeeId)}/>:<section className="workspace-panel"><div className="workspace-notice error">Apply the Epic 8 Checkpoint 2 migration to configure employee availability.</div></section>}</section></main>;
}
