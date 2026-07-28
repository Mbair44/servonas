import assert from "node:assert/strict";import test from "node:test";
import {validateImportAccessAssignment} from "../lib/employeeImport/access.ts";
test("employee imports never grant owner access",()=>assert.match(validateImportAccessAssignment("owner",false,true)??"",/Owner/));
test("login access remains optional and separate from invitations",()=>{
 assert.equal(validateImportAccessAssignment(null,false,false),null);
 assert.match(validateImportAccessAssignment(null,true,false)??"",/access role/);
});
test("elevated access requires explicit confirmation",()=>{
 assert.match(validateImportAccessAssignment("admin",false,false)??"",/confirmation/);
 assert.equal(validateImportAccessAssignment("manager",false,true),null);
});
