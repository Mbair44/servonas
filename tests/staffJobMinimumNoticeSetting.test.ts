import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const root=new URL("../",import.meta.url);

test("staff job scheduling can exempt a tenant from the minimum-notice rule",async()=>{
 const source=await readFile(new URL("lib/jobScheduling.ts",root),"utf8");
 assert.match(source,/minimum_notice_hours,maximum_days_ahead,enforce_minimum_notice_for_staff_job_updates/);
 assert.match(source,/settings\.enforce_minimum_notice_for_staff_job_updates !== false/);
});

test("the staff-job exemption is opt-in and does not weaken public booking",async()=>{
 const migration=await readFile(new URL("supabase/migrations/20261029000200_staff_job_minimum_notice_setting.sql",root),"utf8");
 const publicAvailability=await readFile(new URL("lib/publicAvailability.ts",root),"utf8");
 assert.match(migration,/default true/);
 assert.match(migration,/Public booking always enforces its own minimum notice/);
 assert.match(publicAvailability,/minimum_notice_hours/);
 assert.doesNotMatch(publicAvailability,/enforce_minimum_notice_for_staff_job_updates/);
});
