import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("multi-technician migration preserves legacy jobs and atomically stores one team", async () => {
  const migration = await read("../supabase/migrations/20260911000600_multi_technician_jobs.sql");
  assert.match(migration, /insert into public\.job_assignments[\s\S]+j\.assigned_technician_id/);
  assert.match(migration, /create or replace function public\.set_job_technicians/);
  assert.match(migration, /where business_id=v_business_id and job_id=p_job_id and is_active=true/);
  assert.match(migration, /case when v_position=1 then 'primary' else 'helper' end/);
  assert.match(migration, /set assigned_technician_id=v_ids\[1\]/);
});

test("technician authorization accepts any active job assignment", async () => {
  const migration = await read("../supabase/migrations/20260911000600_multi_technician_jobs.sql");
  assert.match(migration, /assignment\.technician_id=technician\.id/);
  assert.match(migration, /assignment\.is_active=true/);
  assert.match(migration, /public\.is_assigned_technician\(business_id,job_id\)/);
});

test("create and edit job submit a technician list and validate every schedule", async () => {
  const [form, actions] = await Promise.all([
    read("../components/JobForm.tsx"),
    read("../app/app/[businessSlug]/jobs/actions.ts"),
  ]);
  assert.match(form, /name="technicianIds"/);
  assert.match(form, /first selected technician is primary/i);
  assert.match(actions, /formData\.getAll\("technicianIds"\)/);
  assert.match(actions, /Promise\.all\(technicianIds\.map/);
  assert.match(actions, /rpc\("set_job_technicians"/);
});

test("all schedule views and technician portal use active assignments without duplicating jobs", async () => {
  const [schedule, technicianHome, technicianDetail] = await Promise.all([
    read("../app/app/[businessSlug]/schedule/page.tsx"),
    read("../app/tech/page.tsx"),
    read("../app/tech/jobs/[jobId]/page.tsx"),
  ]);
  assert.match(schedule, /from\("job_assignments"\)/);
  assert.match(schedule, /job\.technician_ids\?\.includes\(query\.technician\)/);
  assert.match(schedule, /\["day", "week", "month"\]/);
  assert.match(technicianHome, /from\("job_assignments"\)/);
  assert.match(technicianDetail, /eq\("job_id",jobId\).*eq\("is_active",true\)/);
});
