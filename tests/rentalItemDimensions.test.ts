import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("party rental dimensions flow from inventory editing to public website and booking",async()=>{
 const [inventoryPage,inventoryActions,websiteLoader,bookingLoader,websiteCatalog,bookingClient,migration]=await Promise.all([
  read("app/app/[businessSlug]/rental-inventory/page.tsx"),
  read("app/app/[businessSlug]/rental-inventory/actions.ts"),
  read("lib/businessWebsite.ts"),
  read("app/book/[businessSlug]/loadPublicBookingData.ts"),
  read("components/BusinessRentalCatalog.tsx"),
  read("components/PartyRentalBookingClient.tsx"),
  read("supabase/migrations/20260825000100_rental_item_dimensions.sql"),
 ]);
 assert.match(inventoryPage,/name="lengthFt"/);
 assert.match(inventoryPage,/name="widthFt"/);
 assert.match(inventoryPage,/name="heightFt"/);
 assert.match(inventoryActions,/length_ft:lengthFt/);
 assert.match(inventoryActions,/width_ft:widthFt/);
 assert.match(inventoryActions,/height_ft:heightFt/);
 assert.match(websiteLoader,/image_url,length_ft,width_ft,height_ft/);
 assert.match(websiteLoader,/lengthFt:item\.length_ft==null\?null:Number\(item\.length_ft\)/);
 assert.match(bookingLoader,/image_url,allow_quantity,stock_quantity,length_ft,width_ft,height_ft/);
 assert.match(websiteCatalog,/dimensions&&<small>{dimensions}<\/small>/);
 assert.match(bookingClient,/dimensions&&<p className="inventory-dimensions">{dimensions}<\/p>/);
 assert.match(migration,/add column if not exists length_ft/);
 assert.match(migration,/inventory_items_dimensions_check/);
});
