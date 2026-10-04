import assert from "node:assert/strict";
import test from "node:test";
import {resolveRentalStripeTaxCode,validStripeTaxCode} from "../lib/stripeTaxCodes.ts";
import {calculateBookingTax} from "../lib/bookingTax.ts";
import {readFile} from "node:fs/promises";

test("rental tax code inherits from the business default",()=>{
 assert.deepEqual(resolveRentalStripeTaxCode({businessDefaultTaxCode:"txcd_99999999"}),{taxCode:"txcd_99999999",source:"business"});
});
test("category and item tax-code overrides take precedence",()=>{
 assert.deepEqual(resolveRentalStripeTaxCode({businessDefaultTaxCode:"txcd_business",categoryTaxCode:"txcd_category"}),{taxCode:"txcd_category",source:"category"});
 assert.deepEqual(resolveRentalStripeTaxCode({businessDefaultTaxCode:"txcd_business",categoryTaxCode:"txcd_category",itemTaxCode:"txcd_item"}),{taxCode:"txcd_item",source:"item"});
});
test("existing items with no tax code remain inherited and invalid values are rejected",()=>{
 assert.deepEqual(resolveRentalStripeTaxCode({}),{taxCode:null,source:null});
 assert.equal(validStripeTaxCode("txcd_99999999"),true);
 assert.equal(validStripeTaxCode("not-a-stripe-code"),false);
});

test("delivery remains a separate tax line and never receives an inherited rental code",async()=>{
 const result=await calculateBookingTax({lines:[{id:"rental",amountCents:10000,taxable:true,taxCode:resolveRentalStripeTaxCode({businessDefaultTaxCode:"txcd_99999999"}).taxCode}],discountCents:0,delivery:{id:"delivery",amountCents:2500,taxable:true},settings:{taxEnabled:true,calculationMethod:"automatic",displayMode:"exclusive",manualTaxRateBasisPoints:0,defaultInvoiceItemTaxable:true},exempt:false,depositPercent:50},async lines=>{
  assert.equal(lines[0]?.taxCode,"txcd_99999999");
  assert.equal(lines[1]?.taxCode,undefined);
  return {calculationId:"calculation",lines:lines.map(line=>({id:line.id,taxCents:0}))};
 });
 assert.equal(result.snapshot.lines.find(line=>line.id==="delivery")?.taxCode,undefined);
});

test("checkout and bulk actions preserve inheritance precedence and tenant isolation",async()=>{
 const [checkout,actions]=await Promise.all([
  readFile(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/app/[businessSlug]/rental-inventory/actions.ts",import.meta.url),"utf8"),
 ]);
 assert.match(checkout,/resolveRentalStripeTaxCode\(\{itemTaxCode:item\.tax_code,categoryTaxCode:/);
 assert.match(checkout,/businessDefaultTaxCode:billing\?\.default_stripe_tax_code/);
 assert.match(actions,/bulkSetRentalTaxCode/);
 assert.match(actions,/\.update\(\{tax_code:taxCode\}\)\.eq\("business_id",business\.id\)/);
 assert.match(actions,/setRentalCategoryTaxCode/);
 assert.match(actions,/\.eq\("id",categoryId\)\.eq\("business_id",business\.id\)/);
});
