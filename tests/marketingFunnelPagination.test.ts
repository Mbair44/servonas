import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("marketing funnel paginates tenant-scoped sessions and event windows",async()=>{
 const source=await readFile(new URL("../app/app/[businessSlug]/marketing/funnel/page.tsx",import.meta.url),"utf8");
 assert.match(source,/import \{loadAllPages\} from "@\/lib\/paginatedQuery"/);
 assert.equal((source.match(/loadAllPages\(/g)??[]).length,3);
 assert.match(source,/booking_attribution_sessions[\s\S]*?\.eq\("business_id", business\.id\)[\s\S]*?\.range\(from,to\)/);
 assert.match(source,/booking_funnel_events[\s\S]*?\.gte\("occurred_at", window\.from\)[\s\S]*?\.range\(from,to\)/);
 assert.match(source,/booking_funnel_events[\s\S]*?\.gte\("occurred_at", previousWindowFrom\)[\s\S]*?\.range\(from,to\)/);
});
