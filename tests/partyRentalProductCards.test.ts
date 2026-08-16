import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("generated party-rental sites use cohesive storefront product cards",async()=>{
 const [component,styles,sharedStyles]=await Promise.all([readFile("components/BusinessRentalCatalog.tsx","utf8"),readFile("app/website.css","utf8"),readFile("app/globals.css","utf8")]);
 assert.match(component,/business-site-rental-media/);
 assert.match(component,/business-site-rental-content/);
 assert.match(component,/<RentalPricingFooter/);
 assert.match(component,/aria-label=\{`Check availability for \$\{item\.name\}`\}/);
 assert.match(styles,/\.business-site-rental-card\{display:flex/);
 assert.match(styles,/\.business-site-rental-media\{height:250px/);
 assert.match(styles,/\.business-site-rental-grid \.rental-pricing-footer\{margin-top:auto\}/);
 assert.match(styles,/-webkit-line-clamp:3/);
 assert.match(sharedStyles,/\.rental-pricing-footer\{[^}]*background:#fff/);
});

test("generated rental cards show effective duration and only available multi-day pricing",async()=>{
 const [component,loader]=await Promise.all([readFile("components/BusinessRentalCatalog.tsx","utf8"),readFile("lib/businessWebsite.ts","utf8")]);
 assert.match(component,/rentalHours=\{item\.standardRentalHours\}/);
 assert.match(component,/multiDayMessage=\{item\.multiDayMessage\}/);
 assert.match(loader,/multiDayMessage:rules\.allowMultiDay\?rentalPricingMessage\(rules\):null/);
});
