import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {jobAssignmentErrorMessage} from "../lib/jobAssignmentErrors.ts";
test("missing team RPC identifies the required migration and schema reload",()=>{
 for(const error of [{code:"PGRST202"},{code:"42883",message:"function public.set_job_technicians does not exist"}]){
  assert.match(jobAssignmentErrorMessage(error),/20260911000600_multi_technician_jobs.sql/);
  assert.match(jobAssignmentErrorMessage(error),/reload the database API schema/);
 }
});
test("other missing SQL functions are not incorrectly diagnosed as a missing team migration",()=>{
 assert.doesNotMatch(jobAssignmentErrorMessage({code:"42883",message:"function other_trigger_helper does not exist"}),/migration/);
});
test("permissions and eligibility failures have distinct instructions",()=>{
 assert.match(jobAssignmentErrorMessage({code:"42501"}),/workspace access/);
 assert.match(jobAssignmentErrorMessage({code:"23503",message:"Technician is not assignable to this job"}),/technician access/);
});
test("unexpected failures retain the error code but never raw database contents",()=>{
 const result=jobAssignmentErrorMessage({code:"23505",message:"private database contents"});
 assert.match(result,/23505/);assert.doesNotMatch(result,/private database contents/);
});
test("partial saves retain selected technicians and creation does not falsely report successful assignments",async()=>{
 const actions=await readFile(new URL("../app/app/[businessSlug]/jobs/actions.ts",import.meta.url),"utf8");
 assert.match(actions,/technicianIds:prepared.technicianIds/);
 assert.match(actions,/!assignmentError && prepared.technicianId/);
 assert.match(actions,/if \(assignmentError\) redirect/);
 assert.match(actions,/Job team update failed/);
});
