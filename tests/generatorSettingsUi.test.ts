import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("rental inventory exposes customer generator pricing controls",()=>{
 const page=read("app/app/[businessSlug]/rental-inventory/page.tsx"),actions=read("app/app/[businessSlug]/rental-inventory/actions.ts");
 assert.match(page,/Generator &amp; power/);
 assert.match(page,/Generator price \(\$\)/);
 assert.match(page,/saveGeneratorSettings/);
 assert.match(page,/is_power_generator/);
 assert.match(actions,/export async function saveGeneratorSettings/);
 assert.match(actions,/default_unit_price_cents:price/);
 assert.match(actions,/customer_visible:data\.get\("active"\)===\"on\"/);
 assert.match(actions,/\.eq\("is_power_generator",true\)/);
});
