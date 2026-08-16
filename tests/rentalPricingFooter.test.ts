import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("public rental inventory and booking cards share the same white pricing footer",async()=>{
 const [catalog,booking,footer,styles]=await Promise.all([read("components/BusinessRentalCatalog.tsx"),read("components/PartyRentalBookingClient.tsx"),read("components/RentalPricingFooter.tsx"),read("app/globals.css")]);
 assert.match(catalog,/<RentalPricingFooter/);
 assert.match(booking,/<RentalPricingFooter/);
 assert.match(footer,/Up to \{rentalHours\}-hour rental/);
 assert.match(footer,/rental-pricing-divider/);
 assert.match(styles,/\.rental-pricing-footer\{[^}]*background:#fff/);
 assert.match(styles,/\.rental-pricing-footer>a,[^{]*\{[^}]*background:var\(--booking-brand/);
});
