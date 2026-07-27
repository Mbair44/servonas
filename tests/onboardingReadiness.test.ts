import assert from "node:assert/strict";
import test from "node:test";
import {calculateReadiness} from "../lib/onboardingReadiness.ts";
test("go-live readiness requires actual company, operations, service, and access facts",()=>{
 assert.equal(calculateReadiness({company:true,businessProfile:true,businessHours:true,firstService:true,pilotAccess:true}).ready,true);
 assert.equal(calculateReadiness({company:true,businessProfile:true,businessHours:false,firstService:true,pilotAccess:true}).ready,false);
});
test("employee and customer imports are recommended but never block pilot go-live",()=>{
 const result=calculateReadiness({company:true,businessProfile:true,businessHours:true,firstService:true,pilotAccess:true});
 assert.ok(result.recommended.every(item=>item.blocking===false));
});
