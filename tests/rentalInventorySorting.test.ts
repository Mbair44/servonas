import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("staff rental inventory supports safe sorting controls",async()=>{const page=await read("app/app/[businessSlug]/rental-inventory/page.tsx");for(const value of ["name","category","price","stock","status","newest"])assert.match(page,new RegExp(`value=\\"${value}\\"`));assert.match(page,/sortedItems/);assert.match(page,/direction===\"desc\"/);});
test("public party-rental catalog supports category and text filtering",async()=>{const [catalog,site]=await Promise.all([read("components/BusinessRentalCatalog.tsx"),read("components/BusinessWebsite.tsx")]);assert.match(catalog,/Search rentals/);assert.match(catalog,/Category/);assert.match(catalog,/All rentals/);assert.match(catalog,/setCategory/);assert.match(catalog,/setSearch/);assert.match(site,/BusinessRentalCatalog items=\{site\.rentalItems\}/);});
