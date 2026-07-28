import assert from "node:assert/strict";
import test from "node:test";
import {teamSetupSummary} from "../lib/teamSetup.ts";

test("owner-only teams receive the guided empty state",()=>{
 const result=teamSetupSummary([{auth_user_id:"owner",is_active:true,email:"owner@example.com"}],"owner",0);
 assert.equal(result.ownerOnly,true);assert.equal(result.nonOwnerCount,0);assert.equal(result.employeeCount,1);
});

test("team setup counts employees, pending invitations, and missing emails",()=>{
 const result=teamSetupSummary([{auth_user_id:"owner",is_active:true,email:"owner@example.com"},{auth_user_id:null,is_active:true,email:null},{auth_user_id:"staff",is_active:false,email:"staff@example.com"}],"owner",2);
 assert.deepEqual(result,{employeeCount:3,nonOwnerCount:2,activeCount:2,missingEmailCount:1,pendingInvitationCount:2,importIssueCount:0,ownerOnly:false});
});

test("team setup includes unresolved import issues",()=>{
 const result=teamSetupSummary([],"owner",0,3);
 assert.equal(result.importIssueCount,3);
});
