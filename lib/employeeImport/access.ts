export function validateImportAccessAssignment(accessRole:string|null,invite:boolean,confirmed:boolean){
 if(accessRole==="owner")return"Owner access cannot be assigned through an employee import.";
 if(accessRole&&!["staff","manager","admin"].includes(accessRole))return"Choose a valid Servonas access role.";
 if(invite&&!accessRole)return"Choose an access role before selecting an invitation.";
 if(["manager","admin"].includes(accessRole??"")&&!confirmed)return"Manager or administrator access requires explicit confirmation.";
 return null;
}
