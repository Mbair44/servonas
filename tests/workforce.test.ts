import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOptional, validateEmployeeProfile } from "../lib/workforce.ts";

test("employee profile supports minimal fast entry", () => {
  assert.equal(validateEmployeeProfile({preferredName:"Sam",email:null,profilePhotoUrl:null,hireDate:null,terminationDate:null,isActive:true}),null);
  assert.equal(normalizeOptional("  "),null);
});

test("employee profile rejects invalid identity and lifecycle values", () => {
  assert.match(validateEmployeeProfile({preferredName:"",email:null,profilePhotoUrl:null,hireDate:null,terminationDate:null,isActive:true})!,/required/);
  assert.match(validateEmployeeProfile({preferredName:"Sam",email:"bad",profilePhotoUrl:null,hireDate:null,terminationDate:null,isActive:true})!,/valid employee email/);
  assert.match(validateEmployeeProfile({preferredName:"Sam",email:null,profilePhotoUrl:null,hireDate:"2026-02-01",terminationDate:"2026-01-01",isActive:false})!,/before hire/);
  assert.match(validateEmployeeProfile({preferredName:"Sam",email:null,profilePhotoUrl:null,hireDate:null,terminationDate:"2026-01-01",isActive:true})!,/must be inactive/);
});
