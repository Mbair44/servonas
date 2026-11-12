import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const read=(file:string)=>readFile(resolve(process.cwd(),file),"utf8");
test("public rental product cards preserve the complete product photo",async()=>{
 const [globalStyles,websiteStyles]=await Promise.all([read("app/globals.css"),read("app/website.css")]);
 assert.match(globalStyles,/\.rental-admin-image img,\.inventory-card img,\.store-media img,\.thanksgiving-rental-grid article>img,\.rental-upsell-item img\{object-fit:contain;background:#f3f5f7\}/);
 assert.match(globalStyles,/\.rental-item-detail-image\{[^}]*object-fit:contain[^}]*background:#f3f5f7/);
 assert.match(websiteStyles,/\.business-site-rental-media img\{object-fit:contain;background:#f3f5f7\}/);
 assert.match(globalStyles,/\.promotion-rental-image img\{[^}]*object-fit:contain/);
});
