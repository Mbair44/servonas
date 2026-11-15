import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync(new URL("../app/manage-booking/[token]/page.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("manage booking shows the saved subtotal, discount, and total separately",()=>{
 assert.match(page,/<dt>Subtotal<\/dt><dd>\{money\(booking\.subtotal_cents\)\}<\/dd>/);
 assert.match(page,/<dt>Discount<\/dt><dd>−\{money\(booking\.discount_cents\)\}<\/dd>/);
 assert.match(page,/<dt>Total<\/dt><dd>\{money\(booking\.total_cents\)\}<\/dd>/);
 assert.match(page,/Remaining after deposit/);
});

test("future-balance consent checkbox aligns with its agreement text",()=>{
 assert.match(styles,/\.manage-booking-future-charge-consent\{display:grid;grid-template-columns:18px minmax\(0,1fr\);align-items:start/);
 assert.match(styles,/\.manage-booking-future-charge-consent input\{width:16px;height:16px;margin:3px 0 0/);
});
