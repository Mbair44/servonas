import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("rental inventory exposes and persists the Stripe Tax code and tax treatment",async()=>{
 const [page,actions]=await Promise.all([
  read("app/app/[businessSlug]/rental-inventory/page.tsx"),
  read("app/app/[businessSlug]/rental-inventory/actions.ts"),
 ]);
 assert.match(page,/name="taxableSetting"/);
 assert.match(page,/StripeTaxCodeInput name="taxCode"/);
 assert.match(page,/Stripe Tax code/);
 assert.match(page,/is_taxable,tax_code/);
 assert.match(actions,/taxableSetting==="inherit"\?null:taxableSetting==="taxable"/);
 assert.match(actions,/tax_code:taxCode/);
});

test("rental inventory accepts only Stripe-style tax codes",async()=>{
 const actions=await read("app/app/[businessSlug]/rental-inventory/actions.ts");
 assert.match(actions,/validStripeTaxCode\(taxCode\)/);
 assert.match(actions,/Enter a valid Stripe Tax code beginning with txcd_\./);
});
