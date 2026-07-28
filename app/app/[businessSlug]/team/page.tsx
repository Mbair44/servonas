import Link from "next/link";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import { EmployeeForm } from "@/components/EmployeeForm";
import { createEmployee, setEmployeeActive } from "./workforceActions";
import { inviteTeamMember } from "./actions";
import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { formatPerformance, workloadLabel, workforceStatus } from "@/lib/workforceDashboard";
import {teamSetupSummary} from "@/lib/teamSetup";
import {TeamSetupLanding} from "@/components/TeamSetupLanding";
import {TeamActivationDashboard} from "@/components/TeamActivationDashboard";

const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;
export default async function TeamPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageBusiness(role);
 const now=new Date(),today=dateInTimeZone(now,business.timezone),tomorrow=addDays(today,1),future=addDays(today,30);
 const todayStart=zonedDateTimeToUtc(today,"00:00",business.timezone).toISOString();
 const tomorrowStart=zonedDateTimeToUtc(tomorrow,"00:00",business.timezone).toISOString();
 const futureEnd=zonedDateTimeToUtc(future,"23:59",business.timezone).toISOString();
 const weekday=new Date(`${today}T12:00:00Z`).getUTCDay();
 const [{data:employees,error},{data:roles},{data:workIntervals},{data:exceptions},{data:jobs},{data:technicians},{data:qualifications},{data:capacityProfiles},{data:features},{count:pendingInvitations},{data:invitations},{data:importInvitationRows}]=await Promise.all([
  supabase.from("employees").select("id,preferred_name,legal_name,email,phone,employee_number,profile_photo_url,hire_date,termination_date,is_active,auth_user_id,employee_role_assignments!employee_roles_employee_tenant_fk(is_active,workforce_roles!employee_roles_role_tenant_fk(id,name))").eq("business_id",business.id).order("preferred_name"),
  supabase.from("workforce_roles").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
  supabase.from("employee_weekly_intervals").select("employee_id").eq("business_id",business.id).eq("weekday",weekday).eq("interval_type","working"),
  supabase.from("employee_availability_exceptions").select("id,employee_id,exception_type,starts_at,ends_at,availability_effect,approval_status").eq("business_id",business.id).eq("approval_status","approved").eq("availability_effect","unavailable").gte("ends_at",todayStart).lte("starts_at",futureEnd).order("starts_at"),
  supabase.from("jobs").select("id,status,assigned_technician_id").eq("business_id",business.id).eq("is_deleted",false).lt("starts_at",tomorrowStart).gt("ends_at",todayStart).not("status","in","(canceled,declined)"),
  supabase.from("technician_profiles").select("id,employee_id").eq("business_id",business.id).not("employee_id","is",null),
  supabase.from("employee_qualifications").select("employee_id,status,expires_on").eq("business_id",business.id).eq("status","active"),
  supabase.from("employee_availability_profiles").select("employee_id,maximum_daily_jobs").eq("business_id",business.id),
  supabase.from("employee_workforce_feature_summary").select("employee_id,historical_jobs_completed,average_completion_seconds,historical_revenue_cents").eq("business_id",business.id),
  canEdit?supabase.from("business_invitations").select("id",{head:true,count:"exact"}).eq("business_id",business.id).is("accepted_at",null).gt("expires_at",new Date().toISOString()):Promise.resolve({count:0}),
  canEdit?supabase.from("business_invitations").select("email,accepted_at,expires_at").eq("business_id",business.id):Promise.resolve({data:[]}),
  canEdit?supabase.from("employee_import_rows").select("invitation_status").eq("business_id",business.id).in("invitation_status",["failed","revoked"]):Promise.resolve({data:[]}),
 ]);
 const workingIds=new Set((workIntervals??[]).map(item=>item.employee_id));
 const currentTimeOff=(exceptions??[]).filter(item=>item.starts_at<tomorrowStart&&item.ends_at>todayStart);
 const timeOffIds=new Set(currentTimeOff.map(item=>item.employee_id));
 const technicianEmployee=new Map((technicians??[]).map(item=>[item.id,item.employee_id]));
 const jobsByEmployee=new Map<string,number>();for(const job of jobs??[]){const employeeId=job.assigned_technician_id?technicianEmployee.get(job.assigned_technician_id):null;if(employeeId)jobsByEmployee.set(employeeId,(jobsByEmployee.get(employeeId)??0)+1);}
 const qualificationsByEmployee=new Map<string,number>();for(const item of qualifications??[]){if(!item.expires_on||item.expires_on>=today)qualificationsByEmployee.set(item.employee_id,(qualificationsByEmployee.get(item.employee_id)??0)+1);}
 const capacityByEmployee=new Map((capacityProfiles??[]).map(item=>[item.employee_id,item.maximum_daily_jobs]));
 const featuresByEmployee=new Map((features??[]).map(item=>[item.employee_id,item]));
 const dashboard=(employees??[]).map(employee=>{const feature=featuresByEmployee.get(employee.id);return {
  id:employee.id,active:employee.is_active,worksToday:workingIds.has(employee.id),unavailableToday:timeOffIds.has(employee.id),
  jobCount:jobsByEmployee.get(employee.id)??0,qualificationCount:qualificationsByEmployee.get(employee.id)??0,
  jobsCompleted:Number(feature?.historical_jobs_completed??0),averageCompletionSeconds:feature?.average_completion_seconds===null||feature?.average_completion_seconds===undefined?null:Number(feature.average_completion_seconds),
  revenueCents:Number(feature?.historical_revenue_cents??0),
 };});
 const dashboardByEmployee=new Map(dashboard.map(item=>[item.id,item]));
 const upcomingTimeOff=(exceptions??[]).filter(item=>item.starts_at>=tomorrowStart).slice(0,5);
 const search=(q.search??"").trim().toLowerCase(),status=q.status??"active",roleFilter=q.role??"";
 const visible=(employees??[]).filter(employee=>{
  const employeeRoles=(employee.employee_role_assignments??[]).filter((item:any)=>item.is_active).map((item:any)=>relation(item.workforce_roles));
  return (!search||[employee.preferred_name,employee.legal_name,employee.email,employee.employee_number].some(value=>String(value??"").toLowerCase().includes(search)))
   &&(status==="all"||(status==="active")===employee.is_active)
   &&(!roleFilter||employeeRoles.some((item:any)=>item?.id===roleFilter));
 });
 const setupSummary=teamSetupSummary(employees??[],business.owner_user_id,pendingInvitations??0);
 const pendingEmails=new Set((invitations??[]).filter(invitation=>!invitation.accepted_at&&invitation.expires_at>now.toISOString()).map(invitation=>invitation.email.toLowerCase()));
 const activationCounts={total:(employees??[]).length,active:(employees??[]).filter(employee=>employee.is_active).length,withoutEmail:(employees??[]).filter(employee=>!employee.email).length,
  notInvited:(employees??[]).filter(employee=>employee.email&&!employee.auth_user_id&&!pendingEmails.has(employee.email.toLowerCase())).length,pending:pendingInvitations??0,
  accepted:(employees??[]).filter(employee=>employee.auth_user_id).length,expired:(invitations??[]).filter(invitation=>!invitation.accepted_at&&invitation.expires_at<=now.toISOString()).length,
  failed:(importInvitationRows??[]).filter(row=>row.invitation_status==="failed").length,
  missingRoles:(employees??[]).filter(employee=>!(employee.employee_role_assignments??[]).some((assignment:any)=>assignment.is_active)).length};
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content workforce-page">
  <header className="epic3-header"><div><small>Workforce intelligence</small><h1>Team</h1><p>Understand who works here, what they do, and whether they are active.</p></div>{canEdit&&<a className="sv-button sv-secondary" href="#invite-employee">Invite employee</a>}</header>
  {q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}
  {error&&<div className="workspace-notice error">The workforce migration must be applied before Team can load.</div>}
  <TeamSetupLanding businessSlug={businessSlug} summary={setupSummary} canEdit={canEdit}/>
  <TeamActivationDashboard businessSlug={businessSlug} counts={activationCounts} canEdit={canEdit}/>
  <section className="workforce-summary workforce-daily-summary"><article><span>Working today</span><strong>{dashboard.filter(item=>item.active&&item.worksToday&&!item.unavailableToday).length}</strong><small>Based on weekly availability</small></article><article><span>On time off</span><strong>{dashboard.filter(item=>item.unavailableToday).length}</strong><small>Approved exceptions today</small></article><article><span>Jobs assigned today</span><strong>{jobs?.length??0}</strong><small>Across the active team</small></article><article><span>Current certifications</span><strong>{[...qualificationsByEmployee.values()].reduce((sum,value)=>sum+value,0)}</strong><small>Active, unexpired records</small></article></section>
  <section className="workforce-insight-grid"><article className="workspace-panel"><div className="panel-title"><div><span className="sv-kicker">Next 30 days</span><h2>Upcoming time off</h2></div></div><div className="workforce-time-off">{upcomingTimeOff.length?upcomingTimeOff.map(item=>{const employee=(employees??[]).find(value=>value.id===item.employee_id);return <div key={item.id}><strong>{employee?.preferred_name??"Employee"}</strong><span>{item.exception_type.replaceAll("_"," ")} · {new Intl.DateTimeFormat("en-US",{timeZone:business.timezone,month:"short",day:"numeric"}).format(new Date(item.starts_at))}</span></div>}):<div className="dashboard-empty"><strong>No upcoming time off.</strong><p>Approved PTO and other exceptions will appear here.</p></div>}</div></article><article className="workspace-panel"><div className="panel-title"><div><span className="sv-kicker">Current capacity</span><h2>Workload at a glance</h2></div></div><div className="workforce-workload">{dashboard.filter(item=>item.active).sort((a,b)=>b.jobCount-a.jobCount).slice(0,6).map(item=>{const employee=(employees??[]).find(value=>value.id===item.id);return <div key={item.id}><span>{employee?.preferred_name}</span><strong>{workloadLabel(item.jobCount,capacityByEmployee.get(item.id)??null)}</strong></div>})}</div></article></section>
  <section className="workspace-panel workforce-directory"><div className="panel-title"><div><span className="sv-kicker">Directory</span><h2>Employees</h2></div><span>{visible.length} shown</span></div>
   <form className="workforce-filters"><label>Search<input name="search" defaultValue={q.search??""} placeholder="Name, email, or employee #"/></label><label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></label><label>Role<select name="role" defaultValue={roleFilter}><option value="">All roles</option>{roles?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="sv-button sv-secondary">Filter</button></form>
   <div className="employee-grid">{visible.length?visible.map(employee=>{const employeeRoles=(employee.employee_role_assignments??[]).filter((item:any)=>item.is_active).map((item:any)=>relation(item.workforce_roles)).filter(Boolean),insight=dashboardByEmployee.get(employee.id)!;return <article key={employee.id} className={!employee.is_active?"inactive":""}><div className="employee-avatar">{employee.profile_photo_url?<img src={employee.profile_photo_url} alt=""/>:employee.preferred_name.slice(0,2).toUpperCase()}</div><div><Link href={`/app/${businessSlug}/team/${employee.id}`}><strong>{employee.preferred_name}</strong></Link><span>{employee.employee_number?`#${employee.employee_number} · `:""}{employee.email||employee.phone||"Contact not provided"}</span><div className="employee-role-pills">{employeeRoles.length?employeeRoles.map((item:any)=><em key={item.id}>{item.name}</em>):<em>No roles</em>}</div><div className="employee-operational-summary"><span>{workforceStatus(insight)}</span><span>{workloadLabel(insight.jobCount,capacityByEmployee.get(employee.id)??null)}</span><span>{insight.qualificationCount} qualification{insight.qualificationCount===1?"":"s"}</span><span>{formatPerformance(insight)}</span></div></div><div className="employee-card-actions"><span className={employee.is_active?"active":"inactive"}>{employee.is_active?"Active":"Inactive"}</span>{canEdit&&<form action={setEmployeeActive.bind(null,businessSlug,employee.id)}><input type="hidden" name="active" value={employee.is_active?"false":"true"}/><button className="text-button">{employee.is_active?"Deactivate":"Activate"}</button></form>}</div></article>}):<div className="dashboard-empty"><strong>No employees match these filters.</strong><p>Adjust the directory filters or add an employee.</p></div>}</div>
  </section>
  {canEdit&&<section className="workspace-panel workforce-quick-add" id="invite-employee"><div className="panel-title"><div><span className="sv-kicker">Account access</span><h2>Invite employee</h2><p>Send the existing secure workspace invitation. Accepted invitations automatically link to an employee record.</p></div></div><form action={inviteTeamMember.bind(null,businessSlug)} className="workforce-invite"><label>Email<input type="email" name="email" required placeholder="employee@example.com"/></label><label>Workspace access<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></label><button className="sv-button">Send invitation</button></form></section>}
  {canEdit&&<section className="workspace-panel workforce-quick-add" id="add-employee"><div className="panel-title"><div><span className="sv-kicker">Under one minute</span><h2>Add employee</h2><p>Create the employee record first. Login access remains optional and explicit.</p></div></div><EmployeeForm action={createEmployee.bind(null,businessSlug)} roles={roles??[]} managers={(employees??[]).filter(item=>item.is_active).map(item=>({id:item.id,preferred_name:item.preferred_name}))} submitLabel="Add employee" allowInvitation/></section>}
 </section></main>;
}
