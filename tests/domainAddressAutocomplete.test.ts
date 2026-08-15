import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("domain registration offers Google address autocomplete with manual fallback",async()=>{
 const component=await fs.readFile("components/DomainRegistrantAddressFields.tsx","utf8");
 const page=await fs.readFile("app/app/admin/domains/page.tsx","utf8");
 assert.match(component,/new places\.Autocomplete/);
 assert.match(component,/parseGoogleAddressComponents/);
 assert.match(component,/setLocality\(parsed\.city\)/);
 assert.match(component,/setRegion\(parsed\.state\)/);
 assert.match(component,/setPostalCode\(parsed\.postalCode\)/);
 assert.match(component,/Enter the address manually/);
 assert.match(page,/DomainRegistrantAddressFields/);
 assert.match(page,/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
});
