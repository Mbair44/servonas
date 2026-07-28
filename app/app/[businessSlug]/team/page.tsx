import Link from "next/link";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../WorkspaceNav";
import {EmployeeForm} from "@/components/EmployeeForm";
import {createEmployee,setEmployeeActive} from "./workforceActions";
import {inviteTeamMember} from "./actions";

const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;
const initials=(name:string)=>name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase();

export default async function TeamPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageBusiness(role);
 const now=new Date().toISOString();
 const [{data:employees,error},{data:roles},{data:invitations},{count:importIssues}]=await Promise.all([
  supabase.from("employees").select("id,preferred_name,legal_name,email,phone,employee_number,profile_photo_url,hire_date,is_active,auth_user_id,created_at,employee_role_assignments!employee_roles_employee_tenant_fk(is_active,workforce_roles!employee_roles_role_tenant_fk(id,name))").eq("business_id",business.id).order("preferred_name"),
  supabase.from("workforce_roles").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
  canEdit?supabase.from("business_invitations").select("email,role,accepted_at,expires_at,created_at").eq("business_id",business.id):Promise.resolve({data:[]}),
  canEdit?supabase.from("employee_imports").select("id",{head:true,count:"exact"}).eq("business_id",business.id).gt("failed_row_count",0):Promise.resolve({count:0}),
 ]);
 if(error) console.error("Team directory could not be loaded",{businessId:business.id,code:error.code});

 const pendingByEmail=new Map((invitations??[]).filter(invitation=>!invitation.accepted_at&&invitation.expires_at>now).map(invitation=>[invitation.email.toLowerCase(),invitation]));
 const directory=(employees??[]).map(employee=>{
  const employeeRoles=(employee.employee_role_assignments??[]).filter((assignment:any)=>assignment.is_active).map((assignment:any)=>relation(assignment.workforce_roles)).filter(Boolean) as {id:string;name:string}[];
  const invitation=employee.email?pendingByEmail.get(employee.email.toLowerCase()):undefined;
  const state=invitation?"invited":!employee.email?"missing_email":!employeeRoles.length?"missing_role":employee.is_active?"active":"inactive";
  return {...employee,roles:employeeRoles,invitation,state};
 });
 const search=(q.search??"").trim().toLowerCase(),status=q.status??"all",roleFilter=q.role??"";
 const visible=directory.filter(employee=>(!search||[employee.preferred_name,employee.legal_name,employee.email,employee.employee_number].some(value=>String(value??"").toLowerCase().includes(search)))
  &&(status==="all"||employee.state===status)
  &&(!roleFilter||employee.roles.some(employeeRole=>employeeRole.id===roleFilter)));
 const selected=directory.find(employee=>employee.id===q.employee)??null;
 const pendingCount=pendingByEmail.size,missingEmailCount=directory.filter(employee=>!employee.email).length,missingRoleCount=directory.filter(employee=>!employee.roles.length).length;
 const issueCount=pendingCount+missingEmailCount+missingRoleCount+(importIssues??0);
 const base=`/app/${businessSlug}/team`;

 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content employee-directory-page">
  <header className="employee-page-header">
   <div><nav aria-label="Breadcrumb"><span>Workforce</span><b aria-hidden="true">›</b><span>Employees</span></nav><h1>Employees</h1><p>Manage your team and workspace access.</p></div>
   {canEdit&&<nav className="employee-primary-actions" aria-label="Employee actions"><a className="sv-button" href="#add-employee"><span aria-hidden="true">＋</span>Add employee</a><Link className="sv-button sv-secondary" href={`${base}/imports`}><span aria-hidden="true">↥</span>Import</Link><a className="sv-button sv-secondary" href="#invite-employee"><span aria-hidden="true">♙</span>Invite employee</a></nav>}
  </header>
  {q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}
  {error&&<div className="workspace-notice error">The workforce migration must be applied before Team can load.</div>}

  <section className="employee-stat-row" aria-label="Employee summary">
   <Link href={`${base}#employee-directory`}><span>Total employees</span><strong>{directory.length}</strong><small className="healthy">● {directory.filter(employee=>employee.is_active).length} active</small><i aria-hidden="true">♙</i></Link>
   {pendingCount>0&&<Link href={`${base}?status=invited#employee-directory`}><span>Pending invitations</span><strong>{pendingCount}</strong><small className="warning">● Needs action</small><i aria-hidden="true">◷</i></Link>}
   {missingEmailCount>0&&<Link href={`${base}?status=missing_email#employee-directory`}><span>Missing email</span><strong>{missingEmailCount}</strong><small className="danger">● Needs action</small><i aria-hidden="true">✉</i></Link>}
   {missingRoleCount>0&&<Link href={`${base}?status=missing_role#employee-directory`}><span>Missing roles</span><strong>{missingRoleCount}</strong><small className="violet">● Needs action</small><i aria-hidden="true">♙</i></Link>}
   {issueCount>0&&<Link className="view-issues" href={`${base}?status=missing_role#employee-directory`}>View issues <span aria-hidden="true">→</span></Link>}
  </section>

  <section className={`employee-directory-shell${selected?" has-selection":""}`} id="employee-directory">
   <div className="employee-directory-main">
    <form className="employee-directory-toolbar">
     <label className="employee-search"><span className="sr-only">Search employees</span><input name="search" defaultValue={q.search??""} placeholder="Search by name, email, or employee #"/><b aria-hidden="true">⌕</b></label>
     <label><span>Status</span><select name="status" defaultValue={status}><option value="all">All</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option><option value="missing_email">Missing email</option><option value="missing_role">Missing role</option></select></label>
     <label><span>Role</span><select name="role" defaultValue={roleFilter}><option value="">All roles</option>{roles?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
     <button className="sv-button sv-secondary" type="submit">Filters</button>
    </form>
    <div className="employee-table" role="table" aria-label="Employees">
     <div className="employee-table-head" role="row"><span role="columnheader">Employee</span><span role="columnheader">Role(s)</span><span role="columnheader">Status</span><span role="columnheader">Contact</span><span role="columnheader">Added</span><span aria-hidden="true">•••</span></div>
     {visible.length?visible.map(employee=><Link role="row" className={selected?.id===employee.id?"selected":""} href={`${base}?${new URLSearchParams({...(q.search?{search:q.search}:{}),...(status!=="all"?{status}:{}),...(roleFilter?{role:roleFilter}:{}),employee:employee.id})}#employee-directory`} key={employee.id}>
      <span className="employee-table-identity" role="cell"><span className="employee-table-avatar">{employee.profile_photo_url?<img src={employee.profile_photo_url} alt=""/>:initials(employee.preferred_name)}</span><span><strong>{employee.preferred_name}</strong><small>{employee.employee_number?`#${employee.employee_number}`:employee.email||"No email"}</small></span></span>
      <span className="employee-table-roles" role="cell">{employee.roles.length?employee.roles.map(employeeRole=><em key={employeeRole.id}>{employeeRole.name}</em>):<em>Not assigned</em>}</span>
      <span role="cell"><b className={`employee-state ${employee.state}`}>● {employee.state.replaceAll("_"," ")}</b></span>
      <span className="employee-table-contact" role="cell">{employee.email||employee.phone||"—"}</span>
      <span role="cell">{new Date(employee.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span><span aria-hidden="true">⋮</span>
     </Link>):<div className="dashboard-empty"><strong>No employees match these filters.</strong><p>Adjust the filters or add an employee.</p></div>}
    </div>
    <footer className="employee-table-footer">Showing {visible.length} of {directory.length} employees</footer>
   </div>

   {selected&&<aside className="employee-detail-panel" aria-labelledby="selected-employee-name">
    <header><span className="employee-detail-avatar">{selected.profile_photo_url?<img src={selected.profile_photo_url} alt=""/>:initials(selected.preferred_name)}</span><div><h2 id="selected-employee-name">{selected.preferred_name}</h2><p>{selected.employee_number?`#${selected.employee_number} • `:""}{selected.roles[0]?.name??"No role"}</p></div><b className={`employee-state ${selected.state}`}>{selected.state.replaceAll("_"," ")}</b><Link href={`${base}#employee-directory`} aria-label="Close employee details">×</Link></header>
    <nav aria-label="Employee detail sections"><span className="active">Overview</span><Link href={`${base}/${selected.id}`}>Details</Link><Link href={`${base}/${selected.id}`}>Access</Link><Link href={`${base}/${selected.id}`}>Activity</Link></nav>
    <dl><div><dt>Email</dt><dd>{selected.email||"Not provided"}</dd></div><div><dt>Phone</dt><dd>{selected.phone||"Not provided"}</dd></div><div><dt>Hired</dt><dd>{selected.hire_date?new Date(`${selected.hire_date}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"Not provided"}</dd></div></dl>
    <section><h3>Roles</h3><div className="employee-detail-roles">{selected.roles.length?selected.roles.map(employeeRole=><span key={employeeRole.id}>{employeeRole.name}</span>):<span>None assigned</span>}</div></section>
    <section><h3>Workspace access</h3><p>{selected.auth_user_id?"Active account":selected.invitation?`${selected.invitation.role} invitation pending`:"No login access"}</p><Link className="sv-button sv-secondary" href={`${base}/${selected.id}`}>Manage employee</Link></section>
    <section><h3>Quick actions</h3><Link className="employee-quick-action" href={`${base}/${selected.id}`}>✎ Edit employee</Link>{canEdit&&<form action={setEmployeeActive.bind(null,businessSlug,selected.id)}><input type="hidden" name="active" value={selected.is_active?"false":"true"}/><button className={`employee-quick-action${selected.is_active?" destructive":""}`}>{selected.is_active?"⊘ Deactivate":"Activate employee"}</button></form>}</section>
   </aside>}
  </section>

  {canEdit&&<section className="workspace-panel workforce-quick-add workforce-invite-panel" id="invite-employee" aria-labelledby="invite-employee-title"><div className="panel-title"><div><h2 id="invite-employee-title">Invite employee</h2><p>Invite someone to your workspace.</p></div></div><form action={inviteTeamMember.bind(null,businessSlug)} className="workforce-invite"><label>Email address<input type="email" name="email" required autoComplete="email" inputMode="email" placeholder="employee@example.com"/></label><label>Workspace role<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></label><button className="sv-button" type="submit">Invite</button></form></section>}
  {canEdit&&<section className="workspace-panel workforce-quick-add" id="add-employee"><div className="panel-title"><div><h2>Add employee</h2><p>Create an employee record.</p></div></div><EmployeeForm action={createEmployee.bind(null,businessSlug)} roles={roles??[]} managers={directory.filter(item=>item.is_active).map(item=>({id:item.id,preferred_name:item.preferred_name}))} submitLabel="Add employee" allowInvitation/></section>}
 </section></main>;
}
