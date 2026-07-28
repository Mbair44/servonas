export type TeamSetupEmployee={auth_user_id:string|null;is_active:boolean;email:string|null};

export function teamSetupSummary(employees:TeamSetupEmployee[],ownerUserId:string|null,pendingInvitations:number,importIssues=0){
 const nonOwner=employees.filter(employee=>!ownerUserId||employee.auth_user_id!==ownerUserId);
 return {
  employeeCount:employees.length,
  nonOwnerCount:nonOwner.length,
  activeCount:employees.filter(employee=>employee.is_active).length,
  missingEmailCount:nonOwner.filter(employee=>!employee.email).length,
  pendingInvitationCount:Math.max(0,pendingInvitations),
  importIssueCount:Math.max(0,importIssues),
  ownerOnly:nonOwner.length===0,
 };
}
