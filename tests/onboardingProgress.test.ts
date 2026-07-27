import assert from "node:assert/strict";
import test from "node:test";
import {calculateOnboardingProgress,shouldRequireOnboarding} from "../lib/onboardingProgress.ts";
test("progress is based on completed work rather than visited pages",()=>{
 const result=calculateOnboardingProgress({status:"in_progress",currentStep:5,completedSteps:["welcome","company"]});
 assert.equal(result.percentage,33);assert.equal(result.requiredItems.filter(item=>item.complete).length,2);
});
test("completed onboarding directs businesses to imports",()=>{
 const result=calculateOnboardingProgress({status:"completed",currentStep:6,completedSteps:["welcome","company","profile","hours","service","readiness"]});
 assert.equal(result.percentage,100);assert.match(result.suggestedNextAction,/Import/);
});
test("legacy tenants without onboarding state are never forced into the wizard",()=>{
 assert.equal(shouldRequireOnboarding({stateExists:false}),false);
 assert.equal(shouldRequireOnboarding({stateExists:true,status:"in_progress"}),true);
});
