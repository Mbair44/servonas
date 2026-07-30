"use client";
import Link from "next/link";
import {useCallback,useMemo,useState} from "react";
import {ManagementDrawer} from "./ManagementDrawer";
import {formatEmployeeNumber,type EmployeeNumbering} from "@/lib/employeeNumbering";

type Role={id:string;name:string};
type Employee={
 id:string;preferredName:string;firstName:string;lastName:string;legalName:string|null;email:string|null;phone:string|null;
 employeeNumber:string|null;jobTitle:string|null;hireDate:string|null;notes:string|null;active:boolean;authUserId:string|null;
 profilePhotoUrl:string|null;createdAt:string;roles:Role[];state:"active"|"inactive"|"invited"|"missing_email"|"missing_role";
 invitationRole:string|null;
};
type DrawerMode={kind:"add"}|{kind:"invite"}|{kind:"details";employeeId:string}|null;
type EmployeeSort="employee"|"roles"|"status"|"contact"|"added";
const initials=(name:string)=>name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase();

export function EmployeeManagementConsole({businessSlug,employees,roles,numbering,canEdit,createAction,inviteAction,deactivateAction}:{
 businessSlug:string;employees:Employee[];roles:Role[];numbering:EmployeeNumbering;canEdit:boolean;
 createAction:(formData:FormData)=>void|Promise<void>;inviteAction:(formData:FormData)=>void|Promise<void>;
 deactivateAction:(employeeId:string,formData:FormData)=>void|Promise<void>;
}){
 const [drawer,setDrawer]=useState<DrawerMode>(null),[dirty,setDirty]=useState(false),[search,setSearch]=useState(""),[status,setStatus]=useState("all"),[role,setRole]=useState("");
 const [sort,setSort]=useState<EmployeeSort>("employee"),[direction,setDirection]=useState<"asc"|"desc">("asc");
 const [inviteNow,setInviteNow]=useState(false);
 const close=useCallback(()=>{setDrawer(null);setDirty(false);setInviteNow(false);},[]);
 const requestClose=useCallback(()=>{if(!dirty||window.confirm("Discard your unsaved changes?"))close();},[close,dirty]);
 const open=(next:DrawerMode)=>{setDirty(false);setInviteNow(false);setDrawer(next);};
 const visible=useMemo(()=>employees.filter(employee=>(!search||[employee.preferredName,employee.email,employee.employeeNumber].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase())))
  &&(status==="all"||employee.state===status)&&(!role||employee.roles.some(item=>item.id===role))).sort((left,right)=>{
   const value=(employee:Employee)=>{
    if(sort==="roles")return employee.roles.map(item=>item.name).sort().join(", ")||"Not assigned";
    if(sort==="status")return employee.state;
    if(sort==="contact")return employee.email||employee.phone||"\uffff";
    if(sort==="added")return new Date(employee.createdAt).getTime();
    return employee.preferredName;
   };
   const a=value(left),b=value(right);
   const comparison=typeof a==="string"&&typeof b==="string"?a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}):Number(a)-Number(b);
   return(direction==="asc"?comparison:-comparison)||left.preferredName.localeCompare(right.preferredName);
  }),[direction,employees,role,search,sort,status]);
 const changeSort=(column:EmployeeSort)=>{if(sort===column)setDirection(current=>current==="asc"?"desc":"asc");else{setSort(column);setDirection("asc");}};
 const sortHeader=(column:EmployeeSort,text:string)=><span role="columnheader" aria-sort={sort===column?(direction==="asc"?"ascending":"descending"):"none"}><button type="button" className={sort===column?"active":""} onClick={()=>changeSort(column)}>{text}<i aria-hidden="true">{sort===column?(direction==="asc"?"↑":"↓"):"↕"}</i></button></span>;
 const selected=drawer?.kind==="details"?employees.find(employee=>employee.id===drawer.employeeId)??null:null;
 const pending=employees.filter(employee=>employee.state==="invited").length,missingEmail=employees.filter(employee=>employee.state==="missing_email").length,missingRoles=employees.filter(employee=>employee.state==="missing_role").length;
 return <>
  <header className="employee-page-header"><div><nav aria-label="Breadcrumb"><span>Workforce</span><b aria-hidden="true">›</b><span>Employees</span></nav><h1>Employees</h1><p>Manage your team and workspace access.</p></div>{canEdit&&<nav className="employee-primary-actions" aria-label="Employee actions"><button className="sv-button" onClick={()=>open({kind:"add"})}><span aria-hidden="true">＋</span>Add employee</button><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team/imports`}><span aria-hidden="true">↥</span>Import employees</Link><button className="sv-button sv-secondary" onClick={()=>open({kind:"invite"})}><span aria-hidden="true">♙</span>Invite employee</button></nav>}</header>

  {(pending>0||missingEmail>0||missingRoles>0)&&<nav className="employee-health-chips" aria-label="Employee issues">
   {pending>0&&<button className={status==="invited"?"active":""} onClick={()=>setStatus(status==="invited"?"all":"invited")}><b>{pending}</b> Pending invitation{pending===1?"":"s"}</button>}
   {missingEmail>0&&<button className={status==="missing_email"?"active":""} onClick={()=>setStatus(status==="missing_email"?"all":"missing_email")}><b>{missingEmail}</b> Missing email{missingEmail===1?"":"s"}</button>}
   {missingRoles>0&&<button className={status==="missing_role"?"active":""} onClick={()=>setStatus(status==="missing_role"?"all":"missing_role")}><b>{missingRoles}</b> Missing role{missingRoles===1?"":"s"}</button>}
  </nav>}

  <section className="employee-directory-shell management-list-shell">
   <div className="employee-directory-main">
    <div className="employee-directory-toolbar">
     <label className="employee-search"><span className="sr-only">Search employees</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search by name, email, or employee #"/><b aria-hidden="true">⌕</b></label>
     <label><span>Status</span><select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option><option value="missing_email">Missing email</option><option value="missing_role">Missing role</option></select></label>
     <label><span>Role</span><select value={role} onChange={event=>setRole(event.target.value)}><option value="">All roles</option>{roles.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
     <button className="sv-button sv-secondary" type="button" onClick={()=>{setSearch("");setStatus("all");setRole("");}}>Clear</button>
    </div>
    <div className="employee-table" role="table" aria-label="Employees">
     <div className="employee-table-head" role="row">{sortHeader("employee","Employee")}{sortHeader("roles","Role(s)")}{sortHeader("status","Status")}{sortHeader("contact","Contact")}{sortHeader("added","Added")}</div>
     {visible.length?visible.map(employee=><button role="row" type="button" onClick={()=>open({kind:"details",employeeId:employee.id})} key={employee.id}>
      <span className="employee-table-identity" role="cell"><span className="employee-table-avatar">{employee.profilePhotoUrl?<img src={employee.profilePhotoUrl} alt=""/>:initials(employee.preferredName)}</span><span><strong>{employee.preferredName}</strong><small>{employee.employeeNumber?`#${employee.employeeNumber}`:employee.email||"No email"}</small></span></span>
      <span className="employee-table-roles" role="cell">{employee.roles.length?employee.roles.map(item=><em key={item.id}>{item.name}</em>):<em>Not assigned</em>}</span>
      <span role="cell"><b className={`employee-state ${employee.state}`}>● {employee.state.replaceAll("_"," ")}</b></span><span className="employee-table-contact" role="cell">{employee.email||employee.phone||"—"}</span>
      <span role="cell">{new Date(employee.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
     </button>):<div className="dashboard-empty"><strong>No employees match these filters.</strong><p>Adjust the filters or add an employee.</p></div>}
    </div>
    <footer className="employee-table-footer">Showing {visible.length} of {employees.length} employees</footer>
   </div>
  </section>

  <ManagementDrawer open={drawer?.kind==="add"} title="Add employee" onDirty={()=>setDirty(true)} onClose={requestClose}>
   <form action={createAction} className="quick-employee-form">
    <fieldset><legend>Basic information</legend><div className="quick-form-grid"><label>First name<input required maxLength={100} name="firstName" autoComplete="given-name"/></label><label>Last name<input required maxLength={100} name="lastName" autoComplete="family-name"/></label><label>Email <small>Optional</small><input type="email" name="email" autoComplete="email"/></label><label>Phone <small>Optional</small><input name="phone" autoComplete="tel"/></label><label className="wide">Profile photo <small>Optional · JPG, PNG, or WebP up to 5MB</small><input type="file" name="profilePhoto" accept="image/jpeg,image/png,image/webp"/></label></div></fieldset>
    <fieldset><legend>Workforce role</legend><div className="drawer-role-list">{roles.map(item=><label key={item.id}><input type="checkbox" name="roleIds" value={item.id}/>{item.name}</label>)}</div></fieldset>
    <fieldset><legend>Workspace access <small>Optional</small></legend><label className="drawer-check"><input type="checkbox" name="inviteNow" checked={inviteNow} onChange={event=>setInviteNow(event.target.checked)}/>Invite this employee to the workspace</label>{inviteNow&&<><label>Workspace role<select name="accessRole" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></label><label className="drawer-check"><input type="checkbox" name="confirmElevatedAccess"/>Confirm manager or administrator access when selected</label></>}</fieldset>
    <details><summary>Advanced details</summary><div className="numbering-create-preview"><span>Employee number</span><strong>{numbering.autoAssignEnabled?formatEmployeeNumber(numbering.prefix,numbering.nextNumber,numbering.minimumDigits):"Not automatically assigned"}</strong><small>The final number is assigned when the employee is saved.</small>{numbering.allowManualOverride&&<label>Custom employee number <small>Optional</small><input name="employeeNumber" maxLength={64} pattern="[A-Za-z0-9_-]+"/></label>}</div><div className="quick-form-grid"><label>Preferred name<input name="preferredName" maxLength={200}/></label><label>Legal name<input name="legalName" maxLength={200}/></label><label>Job title<input name="jobTitle" maxLength={120}/></label><label>Employee type<select name="employeeType" defaultValue="other"><option value="technician">Technician</option><option value="dispatcher">Dispatcher</option><option value="office_staff">Office staff</option><option value="sales">Sales</option><option value="manager">Manager</option><option value="owner">Owner</option><option value="other">Other</option></select></label><label>Manager<select name="managerEmployeeId" defaultValue=""><option value="">No manager assigned</option>{employees.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.preferredName}</option>)}</select></label><label>Hire date<input type="date" name="hireDate"/></label><label>Termination date<input type="date" name="terminationDate"/></label><label>Employment status<select name="employmentStatus" defaultValue="active"><option value="active">Active</option><option value="inactive">Inactive</option><option value="leave">On leave</option><option value="terminated">Terminated</option></select></label><label>Profile photo URL<input type="url" name="profilePhotoUrl" placeholder="https://…"/></label><label className="wide">Notes<textarea name="notes" rows={3} maxLength={5000}/></label></div></details>
    <footer><button type="button" className="sv-button sv-secondary" onClick={requestClose}>Cancel</button><button className="sv-button">Add employee</button></footer>
   </form>
  </ManagementDrawer>

  <ManagementDrawer open={drawer?.kind==="invite"} title="Invite employee" onDirty={()=>setDirty(true)} onClose={requestClose} size="compact">
   <form action={inviteAction} className="quick-employee-form compact"><label>Email address<input required type="email" name="email" autoComplete="email" autoFocus/></label><label>Workspace role<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></label><footer><button type="button" className="sv-button sv-secondary" onClick={requestClose}>Cancel</button><button className="sv-button">Invite</button></footer></form>
  </ManagementDrawer>

  <ManagementDrawer open={Boolean(selected)} title={selected?.preferredName??"Employee details"} onDirty={()=>{}} onClose={close}>
   {selected&&<div className="drawer-employee-details"><header><span className="employee-detail-avatar">{selected.profilePhotoUrl?<img src={selected.profilePhotoUrl} alt=""/>:initials(selected.preferredName)}</span><div><h3>{selected.preferredName}</h3><p>{selected.employeeNumber?`#${selected.employeeNumber} • `:""}{selected.roles[0]?.name??"No role"}</p></div><b className={`employee-state ${selected.state}`}>{selected.state.replaceAll("_"," ")}</b></header><nav><span>Overview</span><Link href={`/app/${businessSlug}/team/${selected.id}`}>Roles</Link><Link href={`/app/${businessSlug}/team/${selected.id}`}>Workspace access</Link><Link href={`/app/${businessSlug}/team/${selected.id}`}>History</Link><Link href={`/app/${businessSlug}/team/${selected.id}`}>Notes</Link></nav><dl><div><dt>Email</dt><dd>{selected.email||"Not provided"}</dd></div><div><dt>Phone</dt><dd>{selected.phone||"Not provided"}</dd></div><div><dt>Job title</dt><dd>{selected.jobTitle||"Not provided"}</dd></div><div><dt>Hired</dt><dd>{selected.hireDate||"Not provided"}</dd></div></dl><section><h3>Roles</h3><div className="employee-detail-roles">{selected.roles.length?selected.roles.map(item=><span key={item.id}>{item.name}</span>):<span>None assigned</span>}</div></section><section><h3>Workspace access</h3><p>{selected.authUserId?"Active account":selected.invitationRole?`${selected.invitationRole} invitation pending`:"No login access"}</p></section><footer><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team/${selected.id}`}>Manage employee</Link>{canEdit&&<form action={deactivateAction.bind(null,selected.id)}><input type="hidden" name="active" value={selected.active?"false":"true"}/><button className={`sv-button ${selected.active?"danger":""}`}>{selected.active?"Deactivate":"Activate"}</button></form>}</footer></div>}
  </ManagementDrawer>
 </>;
}
