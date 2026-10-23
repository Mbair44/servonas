import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("assisted booking prepopulates the selected tenant customer's contact and primary location",async()=>{
 const [page,form]=await Promise.all([
  readFile("app/app/[businessSlug]/assisted-booking/page.tsx","utf8"),
  readFile("components/AssistedRentalBookingForm.tsx","utf8"),
 ]);
 assert.match(page,/service_locations/);
 assert.match(page,/\.order\("is_primary",\{ascending:false\}\)/);
 assert.match(page,/address:\[location\?\.street_address,location\?\.unit\]/);
 assert.match(form,/setCustomerDetails\(customer\?/);
 assert.match(form,/firstName:customer\.firstName/);
 assert.match(form,/address:customer\.address/);
 assert.match(form,/value=\{customerDetails\.phone\}/);
 assert.match(form,/value=\{customerDetails\.address\}/);
 assert.match(form,/You can adjust the event address below/);
});
