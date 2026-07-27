import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOptional, validateEmployeeProfile } from "../lib/workforce.ts";
import { validTimeZone, validateAvailabilityProfile, validateWeeklyIntervals } from "../lib/workforceAvailability.ts";
import { validateQualification } from "../lib/workforceQualifications.ts";

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

test("structured employee identity and lifecycle values are validated",()=>{
 assert.equal(validateEmployeeProfile({preferredName:"Sam",firstName:"Sam",lastName:"Rivera",email:"sam@example.com",employeeType:"dispatcher",employmentStatus:"active",profilePhotoUrl:null,hireDate:null,terminationDate:null,isActive:true}),null);
 assert.equal(validateEmployeeProfile({preferredName:"Sam",firstName:"",lastName:"Rivera",email:null,employeeType:"dispatcher",employmentStatus:"active",profilePhotoUrl:null,hireDate:null,terminationDate:null,isActive:true}),"First name is required.");
 assert.equal(validateEmployeeProfile({preferredName:"Sam",firstName:"Sam",lastName:"Rivera",email:null,employeeType:"unknown",employmentStatus:"active",profilePhotoUrl:null,hireDate:null,terminationDate:null,isActive:true}),"Choose a valid employee type.");
});

test("employee availability accepts structured work and break intervals", () => {
  assert.equal(validateAvailabilityProfile({
    timeZone:"America/Phoenix", maximumDailyJobs:6,
    maximumDailyMinutes:480, overtimePreference:"ask",
  }), null);
  assert.equal(validateWeeklyIntervals([
    {weekday:1,interval_type:"working",starts_at:"08:00",ends_at:"17:00"},
    {weekday:1,interval_type:"break",starts_at:"12:00",ends_at:"12:30"},
  ]), null);
  assert.equal(validTimeZone("America/Phoenix"), true);
});

test("employee availability rejects invalid capacity and breaks outside work", () => {
  assert.match(validateAvailabilityProfile({
    timeZone:"Not/AZone", maximumDailyJobs:0,
    maximumDailyMinutes:10, overtimePreference:"sometimes",
  })!, /time zone/i);
  assert.match(validateWeeklyIntervals([
    {weekday:2,interval_type:"working",starts_at:"09:00",ends_at:"17:00"},
    {weekday:2,interval_type:"break",starts_at:"08:00",ends_at:"08:30"},
  ])!, /break/i);
});

test("workforce qualifications remain business-defined and date-valid",()=>{
 assert.equal(validateQualification({type:"skill",name:"Commercial service",issuedOn:null,expiresOn:null}),null);
 assert.equal(validateQualification({type:"certification",name:"EPA Certification",issuedOn:"2026-01-01",expiresOn:"2027-01-01"}),null);
 assert.match(validateQualification({type:"industry_type",name:"Other",issuedOn:null,expiresOn:null})!,/type/i);
 assert.match(validateQualification({type:"license",name:"Electrical License",issuedOn:"2027-01-01",expiresOn:"2026-01-01"})!,/Expiration/i);
});
