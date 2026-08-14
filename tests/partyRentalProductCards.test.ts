import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("generated party-rental sites use cohesive storefront product cards",async()=>{
 const [component,styles]=await Promise.all([readFile("components/BusinessRentalCatalog.tsx","utf8"),readFile("app/website.css","utf8")]);
 assert.match(component,/business-site-rental-media/);
 assert.match(component,/business-site-rental-content/);
 assert.match(component,/business-site-rental-price/);
 assert.match(component,/aria-label=\{`Check availability for \$\{item\.name\}`\}/);
 assert.match(styles,/\.business-site-rental-card\{display:flex/);
 assert.match(styles,/\.business-site-rental-media\{height:250px/);
 assert.match(styles,/-webkit-line-clamp:3/);
 assert.match(styles,/\.business-site-rental-grid footer\{display:grid;gap:8px;margin-top:auto/);
 assert.match(styles,/\.business-site-rental-grid footer a\{display:flex;min-height:46px/);
});

test("generated rental cards show effective duration and only available multi-day pricing",async()=>{
 const [component,loader]=await Promise.all([readFile("components/BusinessRentalCatalog.tsx","utf8"),readFile("lib/businessWebsite.ts","utf8")]);
 assert.match(component,/Up to \{item\.standardRentalHours\}-hour rental/);
 assert.match(component,/item\.multiDayMessage&&/);
 assert.match(loader,/multiDayMessage:rules\.allowMultiDay\?rentalPricingMessage\(rules\):null/);
});
