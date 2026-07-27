import assert from "node:assert/strict";
import test from "node:test";
import {canTransitionEmployeeImport,employeeImportStageLabel,employeeImportTransitions} from "../lib/employeeImport/lifecycle.ts";

test("employee import lifecycle permits only forward and explicit recovery transitions",()=>{
  assert.equal(canTransitionEmployeeImport("uploaded","mapping"),true);
  assert.equal(canTransitionEmployeeImport("mapping","validating"),true);
  assert.equal(canTransitionEmployeeImport("needs_review","validating"),true);
  assert.equal(canTransitionEmployeeImport("ready","importing"),true);
  assert.equal(canTransitionEmployeeImport("importing","completed_with_errors"),true);
  assert.equal(canTransitionEmployeeImport("uploaded","completed"),false);
  assert.equal(canTransitionEmployeeImport("completed","importing"),false);
  assert.equal(canTransitionEmployeeImport("canceled","mapping"),false);
});

test("terminal import states cannot be resumed",()=>{
  for(const status of ["failed","canceled","rolled_back"] as const) assert.deepEqual(employeeImportTransitions[status],[]);
});

test("import stages use plain-language labels",()=>{
  assert.equal(employeeImportStageLabel("mapping"),"Match columns");
  assert.equal(employeeImportStageLabel("validation"),"Validate data");
  assert.equal(employeeImportStageLabel("unknown"),"Import");
});
