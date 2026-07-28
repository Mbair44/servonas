import test from "node:test";
import assert from "node:assert/strict";
import {employeeImportConfirmation,type EmployeeImportReview} from "../lib/employeeImport/review.ts";

const review:EmployeeImportReview={totalRows:30,newEmployees:20,employeesToUpdate:4,rowsToSkip:3,warningRows:2,errorRows:3,employeesToInvite:8,employeesWithoutAccess:5,rolesAssigned:{staff:10},elevatedAssignments:0,managerAssignments:2,territoryAssignments:4,qualificationAssignments:7};

test("review confirmation names exact employee and invitation effects",()=>{
 assert.equal(employeeImportConfirmation(review,true),"Import 24 employees and send 8 invitations?");
 assert.equal(employeeImportConfirmation(review,false),"Import 24 employees without sending invitations?");
});
