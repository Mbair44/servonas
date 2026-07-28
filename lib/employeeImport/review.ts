export type EmployeeImportReview={
 totalRows:number;newEmployees:number;employeesToUpdate:number;rowsToSkip:number;
 warningRows:number;errorRows:number;employeesToInvite:number;employeesWithoutAccess:number;
 rolesAssigned:Record<string,number>;elevatedAssignments:number;managerAssignments:number;
 territoryAssignments:number;qualificationAssignments:number;
};

export function employeeImportConfirmation(review:EmployeeImportReview,sendInvitations:boolean){
 const employees=review.newEmployees+review.employeesToUpdate;
 const invitations=sendInvitations?review.employeesToInvite:0;
 return `Import ${employees} employee${employees===1?"":"s"}${invitations?` and send ${invitations} invitation${invitations===1?"":"s"}`:" without sending invitations"}?`;
}
