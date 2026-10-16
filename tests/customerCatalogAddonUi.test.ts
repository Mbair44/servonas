import test from "node:test";
import assert from "node:assert/strict";
import {customerAddonEstimateCents,pruneCustomerAddonQuantities} from "../lib/customerCatalogAddonUi.ts";

const addons=[{id:"chairs",name:"Chairs",description:null,imageUrl:null,unitPriceCents:250,maxQuantity:4},{id:"attendant",name:"Attendant",description:null,imageUrl:null,unitPriceCents:15000,maxQuantity:1}];
test("catalog add-on quantities are bounded and ineligible selections are removed",()=>{
 assert.deepEqual(pruneCustomerAddonQuantities({chairs:9,attendant:1,removed:2,zero:0},addons),{chairs:4,attendant:1});
});
test("catalog add-on estimate uses only the public catalog price snapshot",()=>{
 assert.equal(customerAddonEstimateCents({chairs:3,attendant:1,unknown:99},addons),15750);
});
