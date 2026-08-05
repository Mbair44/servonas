import {canManageBusiness} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../WorkspaceNav";
import {EmployeeManagementConsole} from "@/components/EmployeeManagementConsole";
import {createEmployee,setEmployeeActive} from "./workforceActions";
import {inviteTeamMember} from "./actions";
import {defaultEmployeeNumbering} from "@/lib/employeeNumbering";
import {headers} from "next/headers";
import CopyInvitationLink from "@/components/CopyInvitationLink";
import {resendInvitation,revokeInvitation} from "./actions";

const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;

export default async function TeamPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageBusiness(role);
 const now=new Date().toISOString();
 const [{data:employees,error},{data:roles},{data:invitations},{data:numbering},{data:memberships},{data:technicians}]=await Promise.all([
  supabase.from("employees").select("id,preferred_name,first_name,last_name,legal_name,email,phone,employee_number,job_title,profile_photo_url,profile_photo_path,hire_date,notes,is_active,auth_user_id,created_at,employee_role_assignments!employee_roles_employee_tenant_fk(is_active,workforce_roles!employee_roles_role_tenant_fk(id,name))").eq("business_id",business.id).order("preferred_name"),
  supabase.from("workforce_roles").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
  canEdit?supabase.from("business_invitations").select("id,email,role,token,accepted_at,expires_at,created_at").eq("business_id",business.id).order("created_at",{ascending:false}):Promise.resolve({data:[]}),
  supabase.from("employee_numbering_settings").select("auto_assign_enabled,prefix,starting_number,next_number,minimum_digits,allow_manual_override").eq("business_id",business.id).maybeSingle(),
  canEdit?supabase.from("business_members").select("user_id,role").eq("business_id",business.id):Promise.resolve({data:[]}),
  supabase.from("technician_directory").select("member_user_id,is_active,is_technician,can_be_assigned_jobs").eq("business_id",business.id),
 ]);
 if(error)console.error("Team directory could not be loaded",{businessId:business.id,code:error.code});
 const pendingByEmail=new Map((invitations??[]).filter(invitation=>!invitation.accepted_at&&invitation.expires_at>now).map(invitation=>[invitation.email.toLowerCase(),invitation]));
 const pendingInvitations=(invitations??[]).filter(invitation=>!invitation.accepted_at&&invitation.expires_at>now),origin=(process.env.NEXT_PUBLIC_SITE_URL||(await headers()).get("origin")||"http://localhost:3000").replace(/\/$/,"");
 const membershipByUser=new Map((memberships??[]).map(item=>[item.user_id,item])),technicianByUser=new Map((technicians??[]).map(item=>[item.member_user_id,item]));
 const directory=await Promise.all((employees??[]).map(async employee=>{
  const employeeRoles=(employee.employee_role_assignments??[]).filter((assignment:any)=>assignment.is_active).map((assignment:any)=>relation(assignment.workforce_roles)).filter(Boolean) as {id:string;name:string}[];
  const invitation=employee.email?pendingByEmail.get(employee.email.toLowerCase()):undefined;
  const state=(invitation?"invited":!employee.email?"missing_email":!employeeRoles.length?"missing_role":employee.is_active?"active":"inactive") as "active"|"inactive"|"invited"|"missing_email"|"missing_role";
  const {data:signedPhoto}=employee.profile_photo_path?await supabase.storage.from("employee-profile-photos").createSignedUrl(employee.profile_photo_path,3600):{data:null};
  return {id:employee.id,preferredName:employee.preferred_name,firstName:employee.first_name,lastName:employee.last_name,legalName:employee.legal_name,email:employee.email,phone:employee.phone,
   employeeNumber:employee.employee_number,jobTitle:employee.job_title,hireDate:employee.hire_date,notes:employee.notes,active:employee.is_active,authUserId:employee.auth_user_id,
   profilePhotoUrl:signedPhoto?.signedUrl??employee.profile_photo_url,createdAt:employee.created_at,roles:employeeRoles,state,invitationRole:invitation?.role??null,
   workspaceRole:employee.auth_user_id?membershipByUser.get(employee.auth_user_id)?.role??null:null,technicianEnabled:employee.auth_user_id?Boolean(technicianByUser.get(employee.auth_user_id)?.is_active&&technicianByUser.get(employee.auth_user_id)?.is_technician&&technicianByUser.get(employee.auth_user_id)?.can_be_assigned_jobs):false};
 }));
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content employee-directory-page">
  {q.success&&<div className="workspace-notice success">{q.success}</div>}{q.error&&<div className="workspace-notice error">{q.error}</div>}
  {q.inviteLink&&<div className="invite-link"><code>{q.inviteLink}</code><CopyInvitationLink url={q.inviteLink}/></div>}
  {error&&<div className="workspace-notice error">The workforce migration must be applied before Team can load.</div>}
  <EmployeeManagementConsole businessSlug={businessSlug} employees={directory} roles={roles??[]} canEdit={canEdit}
   numbering={numbering?{autoAssignEnabled:numbering.auto_assign_enabled,prefix:numbering.prefix,startingNumber:Number(numbering.starting_number),nextNumber:Number(numbering.next_number),minimumDigits:Number(numbering.minimum_digits),allowManualOverride:numbering.allow_manual_override}:defaultEmployeeNumbering}
   createAction={createEmployee.bind(null,businessSlug)} inviteAction={inviteTeamMember.bind(null,businessSlug)}
   deactivateAction={setEmployeeActive.bind(null,businessSlug)} pendingInvitations={pendingInvitations.map(invitation=>({id:invitation.id,email:invitation.email,role:invitation.role,expiresAt:invitation.expires_at,link:`${origin}/invite/accept?token=${invitation.token}`}))}
   resendInvitationAction={resendInvitation.bind(null,businessSlug)} revokeInvitationAction={revokeInvitation.bind(null,businessSlug)}/>
 </section></main>;
}
