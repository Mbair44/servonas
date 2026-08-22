import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("business website renders the full about copy instead of truncating it in the footer",async()=>{
 const component=await readFile("components/BusinessWebsite.tsx","utf8");
 assert.match(component,/\<section className="business-site-about"[\s\S]*\{site\.aboutText\}/);
 assert.match(component,/\<footer className="business-site-footer"[\s\S]*\{site\.aboutText\}/);
 assert.doesNotMatch(component,/aboutText\.slice\(0,180\)/);
});
