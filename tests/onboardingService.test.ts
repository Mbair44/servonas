import assert from "node:assert/strict";
import test from "node:test";
import {normalizeSkills,validateOnboardingService} from "../lib/onboardingService.ts";
const valid={name:"Service call",description:"Initial assessment",durationMinutes:60,price:"125.00",recurringAllowed:false,requiredSkills:["Diagnostics"],active:true};
test("first service accepts optional money and business-defined skills",()=>assert.deepEqual(validateOnboardingService(valid),{}));
test("first service rejects unsafe duration and money precision",()=>{const errors=validateOnboardingService({...valid,durationMinutes:0,price:"1.234"});assert.ok(errors.durationMinutes&&errors.price);});
test("skills are normalized without imposing an industry taxonomy",()=>assert.deepEqual(normalizeSkills("EPA, Diagnostics, EPA"),["EPA","Diagnostics"]));
