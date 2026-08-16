import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website requests recover from duplicate customer creation by reusing the matching customer",async()=>{
 const actions=await read("app/sites/[siteSlug]/actions.ts");
 assert.match(actions,/error\?\.code==="23505"/);
 assert.match(actions,/Website customer conflict could not be resolved/);
 assert.match(actions,/\.(?:or)\(email\?`email\.ilike\.\$\{email\},phone\.eq\.\$\{phone\}`:`phone\.eq\.\$\{phone\}`\)/);
});
