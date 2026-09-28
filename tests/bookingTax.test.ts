import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateBookingTax,type BookingTaxProvider} from '../lib/bookingTax.ts';
import {bookingTaxProvider} from '../lib/bookingTaxProvider.ts';
import type {BusinessTaxSettings} from '../lib/financial/tax.ts';

const settings:BusinessTaxSettings={taxEnabled:true,calculationMethod:'automatic',manualTaxRateBasisPoints:620,displayMode:'exclusive',defaultInvoiceItemTaxable:true};
const fixture=()=>({lines:[{id:'rental',amountCents:18500,taxable:true}],discountCents:5000,delivery:{id:'delivery',amountCents:10000,taxable:false},settings:{...settings},exempt:false,depositPercent:50});
// Provider rate is deliberately different from the configured manual rate.
const provider:BookingTaxProvider=async lines=>({calculationId:'taxcalc_test',lines:lines.map(line=>({id:line.id,taxCents:Math.round(line.amountCents*.08),metadata:{jurisdiction:'fixture'}}))});
test('production regression: automatic provider receives $135 rental and no taxable delivery',async()=>{
 let received:unknown;
 const result=await calculateBookingTax(fixture(),async lines=>{received=lines;return provider(lines);});
 assert.deepEqual(received,[{id:'rental',amountCents:13500,taxable:true,discountCents:5000}]);
 assert.equal(result.taxableSubtotalCents,13500);assert.equal(result.taxCents,1080);
 assert.equal(result.totalCents,24580);assert.equal(result.depositCents,12290);assert.equal(result.remainingBalanceCents,12290);
 assert.equal(result.snapshot.lines[1].taxCents,0);assert.equal(result.snapshot.calculationId,'taxcalc_test');
});
test('rental with no discount',async()=>{const input=fixture();input.discountCents=0;const r=await calculateBookingTax(input,provider);assert.equal(r.taxableSubtotalCents,18500);assert.equal(r.taxCents,1480);});
test('taxable delivery is included once, after rental discount',async()=>{const input=fixture();input.delivery.taxable=true;const r=await calculateBookingTax(input,provider);assert.equal(r.taxableSubtotalCents,23500);assert.equal(r.taxCents,1880);assert.equal(r.totalCents,25380);});
test('explicitly nontaxable rental is excluded',async()=>{const input=fixture();input.lines[0].taxable=false;const r=await calculateBookingTax(input,async()=>{throw Error('must not call');});assert.equal(r.taxCents,0);assert.equal(r.totalCents,23500);});
test('exempt customer bypasses provider even for taxable delivery',async()=>{const input=fixture();input.exempt=true;input.delivery.taxable=true;const r=await calculateBookingTax(input,async()=>{throw Error('must not call');});assert.equal(r.taxCents,0);assert.equal(r.snapshot.customerExempt,true);});
test('disabled tax bypasses provider',async()=>{const input=fixture();input.settings.taxEnabled=false;const r=await calculateBookingTax(input,async()=>{throw Error('must not call');});assert.equal(r.taxCents,0);});
test('manual mode uses manual rate, never provider',async()=>{const input=fixture();input.settings.calculationMethod='manual';const r=await calculateBookingTax(input,async()=>{throw Error('must not call');});assert.equal(r.taxCents,837);assert.equal(r.totalCents,24337);assert.equal(r.depositCents+r.remainingBalanceCents,r.totalCents);});
test('automatic failure never substitutes 620 bps or zero tax',async()=>{await assert.rejects(calculateBookingTax(fixture(),async()=>{throw Error('provider unavailable');}),/provider unavailable/);await assert.rejects(calculateBookingTax(fixture(),async()=>({calculationId:'c',lines:[]})),/incomplete/);});
test('manual inclusive tax is extracted, not charged twice',async()=>{const input=fixture();input.settings.calculationMethod='manual';input.settings.displayMode='inclusive';const r=await calculateBookingTax(input,provider);assert.equal(r.totalCents,23500);assert.equal(r.taxCents,Math.round(13500*620/10620));});
test('mixed eligibility discounts allocate all cents once',async()=>{const input=fixture();input.lines=[{id:'a',amountCents:101,taxable:true},{id:'b',amountCents:102,taxable:false}];input.discountCents=101;input.delivery.amountCents=0;const r=await calculateBookingTax(input,provider);assert.equal(r.snapshot.lines.reduce((sum,line)=>sum+line.discountCents,0),101);assert.equal(r.taxableSubtotalCents,51);});
test('pay later has zero deposit and full final balance',async()=>{const input=fixture();input.depositPercent=0;const r=await calculateBookingTax(input,provider);assert.equal(r.depositCents,0);assert.equal(r.remainingBalanceCents,r.totalCents);});
test('changing settings for later quotes does not mutate saved snapshots',async()=>{const input=fixture();const r=await calculateBookingTax(input,provider);const saved=JSON.stringify(r);input.settings.manualTaxRateBasisPoints=900;await calculateBookingTax(input,provider);assert.equal(JSON.stringify(r),saved);});
test('Stripe adapter sends discounted amounts, connected account, and reads all result pages',async()=>{
 let request:unknown,options:unknown;
 const client={tax:{calculations:{create:async (body:unknown,opts:unknown)=>{request=body;options=opts;return {id:'c',tax_amount_exclusive:1080,tax_amount_inclusive:0,tax_breakdown:[],expires_at:123};},listLineItems:async function*(){yield {reference:'rental',amount_tax:1080,tax_breakdown:[{jurisdiction:'fixture'}]};}}}};
 const p=bookingTaxProvider('acct_tenant',{line1:'123 Main',city:'Mesa',state:'AZ',postal_code:'85201',country:'US'},'exclusive',()=>client as never);
 const r=await calculateBookingTax(fixture(),p);assert.equal(r.taxCents,1080);assert.deepEqual(options,{stripeAccount:'acct_tenant'});
 assert.deepEqual((request as {line_items:unknown}).line_items,[{reference:'rental',amount:13500,tax_behavior:'exclusive'}]);
});
test('checkout persistence/payment wiring uses one final calculation before payment',()=>{
 const route=readFileSync(new URL('../app/api/checkout/route.ts',import.meta.url),'utf8');
 assert.match(route,/tax_cents:taxCents,total_cents:totalCents/);assert.match(route,/unit_amount: depositCents/);
 assert.match(route,/balance_due_cents: totalCents - depositCents/);
 assert.ok(route.indexOf('requiresPriceReview:true')<route.indexOf('supabase.rpc("create_public_booking_quantities_timed"'));
 assert.ok(route.indexOf('if(pricingSnapshotError)')<route.indexOf('stripe.checkout.sessions.create'));
 for(const path of ['book','bookings'])assert.match(readFileSync(new URL(`../app/api/${path}/route.ts`,import.meta.url),'utf8'),/export \{POST\} from "..\/checkout\/route"/);
});
test('migration is additive and prohibits replacing a saved tax snapshot',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20260928000300_public_booking_tax_snapshots.sql',import.meta.url),'utf8');
 assert.doesNotMatch(sql,/update public\.(bookings|booking_items) set/i);assert.match(sql,/old.tax_snapshot is not null/);assert.match(sql,/from public, anon, authenticated/);
});
