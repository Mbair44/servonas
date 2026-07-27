import assert from "node:assert/strict";
import test from "node:test";
import {normalizeMappingHeader,previewFullNameSplit,suggestEmployeeImportMapping,validateEmployeeColumnMappings,type EmployeeColumnMapping} from "../lib/employeeImport/mapping.ts";

test("normalizes and automatically matches common employee headers",()=>{
  assert.equal(normalizeMappingHeader(" Employee First Name "), "employeefirstname");
  assert.deepEqual(suggestEmployeeImportMapping("Given Name"),{destinationField:"first_name",confidence:"high",transformation:"none"});
  assert.deepEqual(suggestEmployeeImportMapping("E-MAIL"),{destinationField:"email",confidence:"exact",transformation:"none"});
  assert.deepEqual(suggestEmployeeImportMapping("Manager Email/ID"),{destinationField:"manager",confidence:"high",transformation:"none"});
  assert.equal(suggestEmployeeImportMapping("Favorite color").destinationField,null);
});

test("requires structured names or an explicit full-name split",()=>{
  const base=(destinationField:string|null,sourceOrdinal:number,transformation="none"):EmployeeColumnMapping=>({
    sourceColumn:`Column ${sourceOrdinal}`,sourceOrdinal,destinationField,transformation,
    confidence:"manual",isIgnored:!destinationField,
  });
  assert.equal(validateEmployeeColumnMappings([base("first_name",0),base("last_name",1)]),null);
  assert.equal(validateEmployeeColumnMappings([base("full_name",0,"split_name")]),null);
  assert.match(validateEmployeeColumnMappings([base("email",0)])??"",/First name/);
});

test("rejects duplicate destination mappings",()=>{
  const mappings:EmployeeColumnMapping[]=["Work email","Personal email"].map((sourceColumn,sourceOrdinal)=>({
    sourceColumn,sourceOrdinal,destinationField:"email",transformation:"none",confidence:"manual",isIgnored:false,
  }));
  assert.match(validateEmployeeColumnMappings(mappings)??"",/mapped more than once/);
});

test("full-name splitting is conservative and marks complex names for review",()=>{
  assert.deepEqual(previewFullNameSplit("Ada Lovelace"),{firstName:"Ada",lastName:"Lovelace",reliable:true});
  assert.deepEqual(previewFullNameSplit("Mary Jane Watson"),{firstName:"Mary",lastName:"Jane Watson",reliable:false});
  assert.deepEqual(previewFullNameSplit("Prince"),{firstName:"Prince",lastName:"",reliable:false});
});
