import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {jobMarketingSource,jobMarketingSourceLabels} from "../lib/jobMarketingSource.ts";

test("job marketing sources use the same supported customer-reported channels",()=>{
 assert.equal(jobMarketingSource("direct"),"direct");
 assert.equal(jobMarketingSource("meta_ads"),"meta_ads");
 assert.equal(jobMarketingSource("not-a-channel"),null);
 assert.equal(jobMarketingSourceLabels.google_ads,"Google Ads");
});

test("job controls expose a tenant-scoped marketing source selector",async()=>{
 const [page,actions]=await Promise.all([
  readFile(new URL("../app/app/[businessSlug]/jobs/[jobId]/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/app/[businessSlug]/jobs/actions.ts",import.meta.url),"utf8"),
 ]);
 assert.match(page,/Marketing source<select name="marketingSource"/);
 assert.match(page,/updateJobMarketingSource\.bind\(null,businessSlug,jobId\)/);
 assert.match(actions,/\.eq\("id",jobId\)\.eq\("business_id",business\.id\)\.eq\("is_deleted",false\)/);
 assert.match(actions,/applyAssistedBookingAttribution\(supabase/);
});
