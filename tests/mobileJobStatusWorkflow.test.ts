import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("web and mobile status changes share one authoritative workflow", async () => {
  const [web, mobile, workflow] = await Promise.all([
    read("app/app/[businessSlug]/jobs/actions.ts"),
    read("app/api/v1/mobile/businesses/[businessId]/jobs/[jobId]/status/route.ts"),
    read("lib/jobs/changeJobStatus.ts"),
  ]);
  assert.match(web, /changeJobStatusWorkflow\(/);
  assert.match(mobile, /changeJobStatusWorkflow\(/);
  assert.match(workflow, /JobNotificationService\.jobConfirmed/);
  assert.match(workflow, /JobNotificationService\.technicianEnRoute/);
  assert.match(workflow, /sendRentalLifecycleSms\(\{ jobId: input\.jobId, type: "technician_en_route" \}\)/);
  assert.match(workflow, /JobNotificationService\.jobCompleted/);
  assert.match(workflow, /JobNotificationService\.reviewRequest/);
  assert.match(workflow, /processCompletedJobBilling\(input\.jobId\)/);
});

test("workflow uses compare-and-set and does not replay effects for same-status retries", async () => {
  const workflow = await read("lib/jobs/changeJobStatus.ts");
  assert.match(workflow, /eq\("status", currentStatus\)/);
  assert.match(workflow, /if \(currentStatus === status\)/);
  assert.match(workflow, /changed: false/);
  assert.match(workflow, /STALE/);
});

test("mobile endpoint remains office-only and keeps card-on-file charging separate", async () => {
  const [route, workflow, web] = await Promise.all([
    read("app/api/v1/mobile/businesses/[businessId]/jobs/[jobId]/status/route.ts"),
    read("lib/jobs/changeJobStatus.ts"),
    read("app/app/[businessSlug]/jobs/actions.ts"),
  ]);
  assert.match(route, /workspace\.membershipRole !== "owner"/);
  assert.match(route, /workspace\.membershipRole !== "admin"/);
  assert.match(route, /workspace\.membershipRole !== "manager"/);
  assert.doesNotMatch(workflow, /chargeCompletedJobCardOnFile/);
  assert.match(web, /export async function chargeCompletedJobCardOnFile/);
});
