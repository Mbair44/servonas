import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("location schema contact fields are refreshed from the rendered tenant business",async()=>{
 const component=await read("components/LocationLanding.tsx");
 assert.match(component,/entry\.email=business\.email\.trim\(\)/);
 assert.match(component,/entry\.telephone=business\.phone\.trim\(\)/);
 assert.match(component,/delete entry\.email/);
});

test("public routes scope location pages and rental images to the active tenant",async()=>{
 const [domainRoute,hostedRoute,domainRental,hostedRental,sitemap]=await Promise.all([
  read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/sites/domain/[domain]/rentals/[itemSlug]/page.tsx"),read("app/sites/[siteSlug]/rentals/[itemSlug]/page.tsx"),read("app/sitemap.xml/route.ts"),
 ]);
 for(const source of [domainRoute,hostedRoute,sitemap])assert.match(source,/business_location_pages/);
 for(const source of [domainRental,hostedRental]){assert.match(source,/eq\("business_id"/);assert.match(source,/rental_item_images\(image_url,alt_text,sort_order\)/);}
 assert.match(sitemap,/eq\("status","published"\)/);
});

test("public rental gallery uses saved image-specific alt text and a non-invented fallback",async()=>{
 const [gallery,landing]=await Promise.all([read("components/RentalImageGallery.tsx"),read("components/RentalDetailLanding.tsx")]);
 assert.match(gallery,/usable\[index\]\.altText\?\.trim\(\)\|\|`\$\{name\} rental photo`/);
 assert.match(landing,/altText:image\.alt_text\?\?null/);
});
