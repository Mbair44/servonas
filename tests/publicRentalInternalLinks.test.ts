import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("published rental categories and location pages cross-link without inventing routes",async()=>{
 const [home,loader,category,hosted,domain]=await Promise.all([
  read("components/BusinessWebsite.tsx"),read("lib/businessWebsite.ts"),read("components/CategoryLanding.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),
 ]);
 assert.match(home,/site\.categoryPages\?\.length/);
 assert.match(loader,/category_website_pages/);
 assert.match(loader,/item\.category_id===page\.category_id/);
 assert.match(category,/Browse rentals by city/);
 assert.match(category,/locationPages\.map/);
 assert.match(hosted,/locationPages=\{\(nearbyPages\?\?\[\]\)/);
 assert.match(domain,/locationPages=\{nearbyPages\?\?\[\]\}/);
});
