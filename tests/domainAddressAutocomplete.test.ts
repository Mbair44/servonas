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

test("public booking routes reuse the shared Google Maps key fallback",async()=>{
 const helper=await fs.readFile("lib/googleMapsKey.ts","utf8");
 const domainBookingPage=await fs.readFile("app/sites/domain/[domain]/booking/page.tsx","utf8");
 const publicBookingPage=await fs.readFile("app/book/[businessSlug]/page.tsx","utf8");
 const checkoutPage=await fs.readFile("app/book/[businessSlug]/booking/page.tsx","utf8");
 assert.match(helper,/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
 assert.match(helper,/GOOGLE_MAPS_API_KEY/);
 assert.match(domainBookingPage,/publicGoogleMapsApiKey/);
 assert.match(publicBookingPage,/publicGoogleMapsApiKey/);
 assert.match(checkoutPage,/publicGoogleMapsApiKey/);
});
