import {canManageBusiness} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../WorkspaceNav";
import {EmployeeManagementConsole} from "@/components/EmployeeManagementConsole";
import {createEmployee,setEmployeeActive} from "./workforceActions";
import {inviteTeamMember} from "./actions";
import {defaultEmployeeNumbering} from "@/lib/employeeNumbering";

const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;

export default async function TeamPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageBusiness(role);
 const now=new Date().toISOString();
 const [{data:employees,error},{data:roles},{data:invitations},{data:numbering}]=await Promise.all([
  supabase.from("employees").select("id,preferred_name,first_name,last_name,legal_name,email,phone,employee_number,job_title,profile_photo_url,hire_date,notes,is_active,auth_user_id,created_at,employee_role_assignments!employee_roles_employee_tenant_fk(is_active,workforce_roles!employee_roles_role_tenant_fk(id,name))").eq("business_id",business.id).order("preferred_name"),
  supabase.from("workforce_roles").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
  canEdit?supabase.from("business_invitations").select("email,role,accepted_at,expires_at").eq("business_id",business.id):Promise.resolve({data:[]}),
  supabase.from("employee_numbering_settings").select("auto_assign_enabled,prefix,starting_number,next_number,minimum_digits,allow_manual_override").eq("business_id",business.id).maybeSingle(),
 ]);
 if(error)console.error("Team directory could not be loaded",{businessId:business.id,code:error.code});
 const pendingByEmail=new Map((invitations??[]).filter(invitation=>!invitation.accepted_at&&invitation.expires_at>now).map(invitation=>[invitation.email.toLowerCase(),invitation]));
 const directory=(employees??[]).map(employee=>{
  const employeeRoles=(employee.employee_role_assignments??[]).filter((assignment:any)=>assignment.is_active).map((assignment:any)=>relation(assignment.workforce_roles)).filter(Boolean) as {id:string;name:string}[];
  const invitation=employee.email?pendingByEmail.get(employee.email.toLowerCase()):undefined;
  const state=(invitation?"invited":!employee.email?"missing_email":!employeeRoles.length?"missing_role":employee.is_active?"active":"inactive") as "active"|"inactive"|"invited"|"missing_email"|"missing_role";
  return {id:employee.id,preferredName:employee.preferred_name,firstName:employee.first_name,lastName:employee.last_name,legalName:employee.legal_name,email:employee.email,phone:employee.phone,
   employeeNumber:employee.employee_number,jobTitle:employee.job_title,hireDate:employee.hire_date,notes:employee.notes,active:employee.is_active,authUserId:employee.auth_user_id,
   profilePhotoUrl:employee.profile_photo_url,createdAt:employee.created_at,roles:employeeRoles,state,invitationRole:invitation?.role??null};
 });
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content employee-directory-page">
  {q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}
  {error&&<div className="workspace-notice error">The workforce migration must be applied before Team can load.</div>}
  <EmployeeManagementConsole businessSlug={businessSlug} employees={directory} roles={roles??[]} canEdit={canEdit}
   numbering={numbering?{autoAssignEnabled:numbering.auto_assign_enabled,prefix:numbering.prefix,startingNumber:Number(numbering.starting_number),nextNumber:Number(numbering.next_number),minimumDigits:Number(numbering.minimum_digits),allowManualOverride:numbering.allow_manual_override}:defaultEmployeeNumbering}
   createAction={createEmployee.bind(null,businessSlug)} inviteAction={inviteTeamMember.bind(null,businessSlug)}
   deactivateAction={setEmployeeActive.bind(null,businessSlug)}/>
 </section></main>;
}
