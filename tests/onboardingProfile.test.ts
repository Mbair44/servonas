import assert from "node:assert/strict";
import test from "node:test";
import {suggestedProfileDefaults,validateBusinessProfile} from "../lib/onboardingProfile.ts";
test("business profile supports every operating model without industry restrictions",()=>{
 for(const operatingModel of ["route_service","appointment_service","rental_inventory","project_service"])assert.deepEqual(validateBusinessProfile({operatingModel,industryProfile:"plumbing",otherIndustry:""}),{});
});
test("other industry requires a useful label",()=>assert.ok(validateBusinessProfile({operatingModel:"route_service",industryProfile:"other",otherIndustry:""}).otherIndustry));
test("industry defaults are editable suggestions only",()=>{
 assert.deepEqual(suggestedProfileDefaults("pool_service"),{serviceName:"Pool service",durationMinutes:45,recurringAllowed:true});
 assert.equal(suggestedProfileDefaults("unknown").serviceName,"Service call");
});
