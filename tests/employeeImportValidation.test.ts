import assert from "node:assert/strict";import test from "node:test";
import {validateEmployeeImportRow} from "../lib/employeeImport/validation.ts";
import type {EmployeeColumnMapping} from "../lib/employeeImport/mapping.ts";
const mapping=(sourceOrdinal:number,destinationField:string,transformation="none"):EmployeeColumnMapping=>({sourceColumn:destinationField,sourceOrdinal,destinationField,transformation,confidence:"manual",isIgnored:false});
test("validates normalized employee rows before import",()=>{
 const result=validateEmployeeImportRow(["Ada","Lovelace","ada@example.com"],[mapping(0,"first_name"),mapping(1,"last_name"),mapping(2,"email")]);
 assert.equal(result.status,"ready");assert.equal(result.normalizedValues.email,"ada@example.com");
});
test("explains invalid contact and required names",()=>{
 const result=validateEmployeeImportRow(["","invalid"],[mapping(0,"first_name"),mapping(1,"email")]);
 assert.equal(result.status,"error");assert.ok(result.errors.some(error=>error.includes("Last name")));assert.ok(result.errors.some(error=>error.includes("email")));
});
test("full-name splits that need judgment remain warnings",()=>{
 const result=validateEmployeeImportRow(["Mary Jane Watson"],[mapping(0,"full_name","split_name")]);
 assert.equal(result.status,"warning");assert.equal(result.normalizedValues.last_name,"Jane Watson");
});
