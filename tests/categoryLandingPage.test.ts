import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("custom domains resolve published category pages instead of returning an early 404",async()=>{
 const route=await read("app/sites/domain/[domain]/[promotionSlug]/page.tsx");
 assert.match(route,/from\("category_website_pages"\)/);
 assert.match(route,/eq\("status","published"\)/);
 assert.match(route,/if\(!categoryPage\)notFound\(\)/);
 assert.ok(route.indexOf("if(!categoryPage)notFound()")>route.indexOf("if(promotion)"));
 assert.match(route,/<CategoryLanding/);
 assert.match(route,/item\.category_id===categoryPage\.category_id/);
});

test("category landing pages reuse promotion styling and tenant branding only",async()=>{
 const [landing,hosted,layout]=await Promise.all([read("components/CategoryLanding.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/layout.tsx")]);
 assert.match(landing,/promotion-landing category-landing/);
 assert.match(landing,/business\.logoUrl/);
 assert.match(landing,/business\.phone/);
 assert.match(landing,/item\.description/);
 assert.doesNotMatch(landing,/Servonas/);
 assert.match(hosted,/booking_settings/);
 assert.match(hosted,/logo_url,brand_color/);
 assert.match(layout,/!barePublicShell&&<footer/);
});
