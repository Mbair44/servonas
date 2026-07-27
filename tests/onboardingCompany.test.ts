import assert from "node:assert/strict";
import test from "node:test";
import {isIanaTimezone,validateOnboardingCompany} from "../lib/onboardingCompany.ts";
const valid={name:"Acme Plumbing",displayName:"Acme",slug:"acme-plumbing",addressLine1:"1 Main St",addressLine2:"",city:"Phoenix",region:"AZ",postalCode:"85001",country:"US",phone:"+1 602 555 0100",email:"office@acme.test",website:"https://acme.test",timezone:"America/Phoenix"};
test("company onboarding accepts structured tenant information",()=>assert.deepEqual(validateOnboardingCompany(valid),{}));
test("company onboarding rejects invalid URLs, email, slug, and timezone",()=>{
 const errors=validateOnboardingCompany({...valid,slug:"Bad Slug",email:"bad",website:"javascript:bad",timezone:"Phoenix"});
 assert.ok(errors.slug&&errors.email&&errors.website&&errors.timezone);
});
test("timezone validation accepts IANA zones",()=>{assert.equal(isIanaTimezone("America/New_York"),true);assert.equal(isIanaTimezone("local"),false);});
