import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {tenantCategoryPageHref} from "../lib/publicCategoryPageUrl.ts";

test("category links always resolve from the tenant root",()=>{
 assert.equal(tenantCategoryPageHref("bounce-house"),"/bounce-house");
 assert.equal(tenantCategoryPageHref("/bounce-house"),"/bounce-house");
 assert.equal(tenantCategoryPageHref("/bounce-house/"),"/bounce-house");
});

test("category links reject values that could escape a tenant-root category route",()=>{
 for(const value of ["", "https://example.com/category", "//example.com/category", "bounce-house?utm_source=test", "bounce-house#details", "rentals/bounce-house", "../bounce-house"]){
  assert.equal(tenantCategoryPageHref(value),null,value);
 }
});

test("location pages use the normalized tenant-root category href",()=>{
 const source=readFileSync(new URL("../components/LocationLanding.tsx",import.meta.url),"utf8");
 assert.match(source,/tenantCategoryPageHref\(category\.slug\)/);
 assert.match(source,/<Link href=\{href\}/);
 assert.doesNotMatch(source,/<Link href=\{category\.slug\}/);
});
