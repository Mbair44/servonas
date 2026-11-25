import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const read=(file:string)=>readFile(resolve(process.cwd(),file),"utf8");
test("rental gallery protects tenant ownership, ordering, and legacy compatibility",async()=>{
 const [migration,actions]=await Promise.all([read("supabase/migrations/20261111000100_rental_item_image_gallery.sql"),read("app/app/[businessSlug]/rental-inventory/actions.ts")]);
 assert.match(migration,/foreign key\(inventory_item_id,business_id\) references public\.inventory_items\(id,business_id\)/);
 assert.match(migration,/unique\(inventory_item_id,sort_order\)/);
 assert.match(migration,/sync_rental_item_image_compatibility/);
 assert.match(migration,/drop policy if exists "members view rental image metadata"/);
 assert.match(actions,/urls\.length>10/);
 assert.match(actions,/storagePathFromGalleryUrl/);
 assert.match(actions,/assertGalleryObjectsExist/);
 assert.match(actions,/replace_rental_item_images/);
});
test("rental gallery supports existing images and accessible touch navigation",async()=>{
 const [uploader,gallery]=await Promise.all([read("components/RentalInventoryFileFields.tsx"),read("components/RentalImageGallery.tsx")]);
 assert.match(uploader,/name="rentalImageUrls"/);
 assert.match(uploader,/draggable/);
 assert.match(uploader,/10-photo and 8 MB limits/);
 assert.match(gallery,/onTouchStart/);
 assert.match(gallery,/onTouchEnd/);
 assert.match(gallery,/aria-modal="true"/);
 assert.match(gallery,/document\.activeElement/);
 assert.match(gallery,/trigger\.current\?\.focus/);
});
