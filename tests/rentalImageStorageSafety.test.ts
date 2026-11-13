import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";

const root=process.cwd();
const read=(file:string)=>readFile(join(root,file),"utf8");

test("gallery saves verify tenant-scoped storage objects and retain only attached legacy URLs",async()=>{
 const source=await read("app/app/[businessSlug]/rental-inventory/actions.ts");
 assert.match(source,/storagePathFromGalleryUrl/);
 assert.match(source,/storagePath\.startsWith\(`\$\{businessId\}\/`\)/);
 assert.match(source,/display\\\\\.webp/);
 assert.match(source,/storage\.from\(inventoryImageBucket\)\.list\(folder/);
 assert.match(source,/One or more rental photo uploads are missing/);
 assert.match(source,/legacyUrls\.has\(url\)/);
 assert.match(source,/new Set\(values\)\.size!==values\.length/);
 assert.match(source,/urls\.length>10/);
});

test("orphan cleanup retries safely and rechecks every gallery reference before deletion",async()=>{
 const worker=await read("lib/rentalImageCleanup.ts");
 const migration=await read("supabase/migrations/20261112000100_rental_item_image_gallery.sql");
 assert.match(migration,/rental_image_cleanup_jobs/);
 assert.match(migration,/after delete on public\.rental_item_images/);
 assert.match(worker,/rental_item_images/);
 assert.match(worker,/\.eq\("image_url",job\.image_url\)/);
 assert.match(worker,/\.contains\("image_urls",\[job\.image_url\]\)/);
 assert.match(worker,/db\.storage\.from\(bucket\)\.remove\(paths\)/);
 assert.match(worker,/retryAt\(attempts\)/);
 assert.match(worker,/attempt_count:attempts/);
 assert.match(worker,/next_attempt_at/);
});

test("cleanup is protected by the normal cron secret and does not run in a database transaction",async()=>{
 const route=await read("app/api/cron/rental-image-cleanup/route.ts");
 const vercel=await read("vercel.json");
 assert.match(route,/Bearer \$\{process\.env\.CRON_SECRET\}/);
 assert.match(route,/cleanupOrphanedRentalImages\(100\)/);
 assert.match(vercel,/"path": "\/api\/cron\/rental-image-cleanup", "schedule": "\*\/5 \* \* \* \*"/);
 assert.doesNotMatch(await read("app/app/[businessSlug]/rental-inventory/actions.ts"),/removeInventoryImageVariants/);
});
