import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("public catalog endpoint is feature-gated and uses tenant-scoped eligibility",()=>{const source=read("app/api/public-booking/[businessSlug]/customer-addons/route.ts");assert.match(source,/customerCatalogAddonsUiEnabled/);assert.match(source,/\.ilike\("public_slug",businessSlug\)/);assert.match(source,/eligibleCustomerAddons/);assert.match(source,/\.eq\("business_id",settings\.business_id\)/);});
test("booking UI keeps catalog selections out of checkout and blocks continuation",()=>{const source=read("components/PartyRentalBookingClient.tsx");assert.match(source,/customerCatalogAddonsUiEnabled/);assert.match(source,/CustomerCatalogAddonPicker/);assert.match(source,/hasSelectedCustomerAddons/);assert.match(source,/Customer add-ons are still being prepared for checkout/);assert.doesNotMatch(source,/catalogAddonItems:/);});
