import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile jobs list uses server-side tenant, office, technician, and business-timezone scope", async () => {
  const route = await read("app/api/v1/mobile/businesses/[businessId]/jobs/route.ts");
  assert.match(route, /createMobileAuthorizationContext\(request\)/);
  assert.match(route, /requireMobileWorkspace\(context,businessId\)/);
  assert.match(route, /requireOffice\(workspace\)/);
  assert.match(route, /job_assignments!inner/);
  assert.match(route, /mobileJobRangeBounds\(business\.timezone,query\.data\.range\)/);
  assert.match(route, /\.eq\("job_assignments\.is_active",true\)/);
  assert.match(route, /\.order\("starts_at"/);
  assert.doesNotMatch(route, /stripe|payment|invoice|twilio|sms|transition_assigned_job_status/i);
});

test("native office and technician job screens expose all bounded ranges with tenant-scoped query keys", async () => {
  const [technician, office] = await Promise.all([
    read("apps/mobile/app/(technician)/technician/[businessId].tsx"),
    read("apps/mobile/app/(office)/office/[businessId].tsx"),
  ]);
  for (const screen of [technician, office]) {
    assert.match(screen, /\["today","upcoming","past"\]/);
    assert.match(screen, /tenantQueryKey\(me\.data\?\.user\.id\?\?"pending",businessId,"jobs",range\)/);
    assert.match(screen, /mobileJobs\(businessId,range,signal\)/);
  }
  assert.match(technician, /technicianEligible/);
});
