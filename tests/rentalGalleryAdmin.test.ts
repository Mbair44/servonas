import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(file:string)=>readFile(file,"utf8");
test("admin gallery hydrates by immutable inventory id and sends ordered state",async()=>{const [page,uploader]=await Promise.all([read("app/app/[businessSlug]/rental-inventory/page.tsx"),read("components/RentalInventoryFileFields.tsx")]);assert.match(page,/inventoryItemId=\{item\?\.id\}/);assert.match(page,/rental_item_images\(image_url,sort_order\)/);assert.match(uploader,/galleryInventoryItemId/);assert.match(uploader,/rentalImageUrls/);assert.match(uploader,/photos\.length\+files\.length>10/);});
test("admin save uses the guarded canonical RPC",async()=>{const action=await read("app/app/[businessSlug]/rental-inventory/actions.ts");assert.match(action,/replace_rental_item_images/);assert.match(action,/galleryExpectedUpdatedAt/);assert.match(action,/another editor/);assert.match(action,/saveGallery\(supabase,business\.id,itemId,data\)/);});
