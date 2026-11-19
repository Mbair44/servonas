import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile note route uses bearer authorization, assignment scope, and the hardened idempotent RPC", async () => {
  const route = await read("app/api/v1/mobile/businesses/[businessId]/jobs/[jobId]/notes/route.ts");
  assert.match(route, /createMobileAuthorizationContext\(request\)/);
  assert.match(route, /requireMobileJobAssignment\(context,businessId,jobId\)/);
  assert.match(route, /append_assigned_job_note_v2/);
  assert.match(route, /p_request_id:parsed\.data\.idempotencyKey/);
  assert.match(route, /error\.code==="23505"/);
  assert.doesNotMatch(route, /getSupabaseAdmin|service.role|processCompletedJobBilling|stripe|twilio|transition_assigned_job_status/i);
});

test("job detail resolves a verified dual-role assignment without granting office-only users technician actions", async () => {
  const route = await read("app/api/v1/mobile/businesses/[businessId]/jobs/[jobId]/route.ts");
  assert.match(route, /office&&context\.techniciansByBusinessId\.has\(businessId\)/);
  assert.match(route, /assignment=await requireMobileJobAssignment\(context,businessId,jobId\)/);
  assert.match(route, /role=assignment\?\.assignmentRole\?\?null/);
  assert.match(route, /allowedActions=assignment\?\["add_note"\]:\[\]/);
  assert.match(route, /if\(!\(error instanceof MobileApiError&&error\.code==="FORBIDDEN"\)\)throw error/);
});

test("native note composer keeps a request UUID through an explicit retry and invalidates only the current job", async () => {
  const screen = await read("apps/mobile/app/(protected)/jobs/[businessId]/[jobId].tsx");
  assert.match(screen, /import \* as Crypto from "expo-crypto"/);
  assert.match(screen, /return Crypto\.randomUUID\(\)/);
  assert.match(screen, /noteRequestId\.current\?\?=noteRequestUuid\(\)/);
  assert.match(screen, /retry:false/);
  assert.match(screen, /invalidateQueries\(\{queryKey:detailKey\}\)/);
  assert.match(screen, /noteMutation\.reset\(\)/);
  assert.match(screen, /allowedActions\.includes\("add_note"\)/);
  assert.doesNotMatch(screen, /transition_status|processCompletedJobBilling|stripe|twilio/i);
});

test("mobile API contract errors expose only a safe field path and request reference", async () => {
  const api = await read("apps/mobile/lib/api.ts");
  assert.match(api, /function invalidResponseMessage/);
  assert.match(api, /issue\.path\.join\("\."\)/);
  assert.match(api, /Reference: \$\{reference\}/);
  assert.doesNotMatch(api, /console\.(?:log|warn|error)\([^)]*(?:access_token|refresh_token|body)/);
});
