import assert from "node:assert/strict";
import test from "node:test";
import {bookingTaxLineDiagnostics} from "../lib/bookingTaxDiagnostics.ts";

test("Stripe Tax diagnostics include line-level tax information without customer or payment data",()=>{
 const lines=bookingTaxLineDiagnostics({items:[{id:"rental",name:"Castle Bounce House"}],lines:[{id:"rental",amountCents:13500,taxCode:"txcd_99999999",taxCodeSource:"business"}],snapshots:[{id:"rental",taxCents:1080,providerDetails:{tax_breakdown:[{taxability_reason:"standard_rated"},{taxability_reason:"standard_rated"}]}}]});
 assert.deepEqual(lines,[{itemName:"Castle Bounce House",amountCents:13500,effectiveTaxCode:"txcd_99999999",taxCodeSource:"business",returnedTaxCents:1080,taxabilityReasons:["standard_rated"]}]);
 assert.equal(JSON.stringify(lines).includes("address"),false);
 assert.equal(JSON.stringify(lines).includes("payment"),false);
});
