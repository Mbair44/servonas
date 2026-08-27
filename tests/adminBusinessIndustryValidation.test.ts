import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("admin business setup normalizes industry values and exposes canonical options",async()=>{
 const [actions,newPage,detailPage]=await Promise.all([
  read("app/app/admin/businesses/actions.ts"),
  read("app/app/admin/businesses/new/page.tsx"),
  read("app/app/admin/businesses/[businessId]/page.tsx"),
 ]);
 assert.match(actions,/function normalizeIndustry\(input: string\)/);
 assert.match(actions,/replace\(\/\[\\s-\]\+\/g, "_"\)/);
 assert.match(actions,/INDUSTRY_PROFILES\.includes\(normalized as IndustryProfile\)/);
 assert.match(actions,/p_industry: industry \|\| null/);
 assert.match(newPage,/select name="industry"/);
 assert.match(newPage,/junk_removal: "Junk removal"/);
 assert.match(newPage,/INDUSTRY_PROFILES\.map\(value => <option key=\{value\} value=\{value\}>/);
 assert.match(detailPage,/select name="industry"/);
 assert.match(detailPage,/junk_removal: "Junk removal"/);
 assert.match(detailPage,/INDUSTRY_PROFILES\.map\(value => <option key=\{value\} value=\{value\}>/);
});
