import assert from "node:assert/strict";import test from "node:test";
import {findEmployeeDuplicate} from "../lib/employeeImport/duplicates.ts";
const employees=[{id:"one",first_name:"Ada",last_name:"Lovelace",email:"ada@example.com",phone:"+1 555 555 0100",employee_number:"EMP-1",hire_date:"2026-01-01"}];
test("employee ID and normalized email are definite tenant duplicate signals",()=>{
 assert.equal(findEmployeeDuplicate({employee_number:"emp-1"},employees).matchType,"definite");
 assert.equal(findEmployeeDuplicate({email:" ADA@EXAMPLE.COM "},employees).matchType,"definite");
});
test("phone requires a corroborating name and is only a possible match",()=>{
 assert.equal(findEmployeeDuplicate({first_name:"Ada",last_name:"Lovelace",phone:"15555550100"},employees).matchType,"possible");
 assert.equal(findEmployeeDuplicate({first_name:"Grace",last_name:"Hopper",phone:"15555550100"},employees).matchType,"none");
});
test("a name alone never creates a duplicate match",()=>assert.equal(findEmployeeDuplicate({first_name:"Ada",last_name:"Lovelace"},employees).matchType,"none"));
