import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("public catalog endpoint is feature-gated and uses tenant-scoped eligibility",()=>{const source=read("app/api/public-booking/[businessSlug]/customer-addons/route.ts");assert.match(source,/customerCatalogAddonsUiEnabled/);assert.match(source,/\.ilike\("public_slug",businessSlug\)/);assert.match(source,/eligibleCustomerAddons/);assert.match(source,/\.eq\("business_id",settings\.business_id\)/);});
test("booking UI sends gated catalog selections through the reviewed checkout path",()=>{const source=read("components/PartyRentalBookingClient.tsx");assert.match(source,/customerCatalogAddonsUiEnabled/);assert.match(source,/CustomerCatalogAddonPicker/);assert.match(source,/customerCatalogAddons:selectedCustomerCatalogAddons/);assert.match(source,/customerAddonRequestKey/);assert.match(source,/Taxes and deposit will be confirmed before payment/);assert.doesNotMatch(source,/still being prepared for checkout/);});
