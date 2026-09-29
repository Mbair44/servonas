import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicMoney,normalizePublicRentalPrice,requirePublicAmounts} from '../lib/publicBookingNumbers.ts';
test('unknown or malformed money is unavailable, never free or non-finite',()=>{
 for(const value of [null,undefined,'',true,'bad',NaN,Infinity,-Infinity,1.5])assert.equal(publicMoney(value),'Price unavailable');
 assert.equal(publicMoney(0),'$0.00');assert.equal(publicMoney('10000'),'$100.00');assert.equal(publicMoney(-5000),'-$50.00');
});
test('date-aware API price supplies day-one amount without changing totals',()=>{
 const price=normalizePublicRentalPrice({dateAdjustedBasePriceCents:18500,totalUnitPriceCents:27750,additionalDayUnitPriceCents:9250,rentalDays:2});
 assert.equal(price.baseUnitPriceCents,18500);assert.equal(price.totalUnitPriceCents,27750);
 assert.equal(publicMoney(price.baseUnitPriceCents*2),'$370.00');
 for(const value of [null,undefined,'bad',Infinity])assert.throws(()=>normalizePublicRentalPrice({...price,baseUnitPriceCents:value,dateAdjustedBasePriceCents:value}));
 assert.equal(normalizePublicRentalPrice({...price,baseUnitPriceCents:0}).baseUnitPriceCents,0);
});
test('required delivery and quote amounts reject missing data without changing valid cents',()=>{
 const quote={feeCents:10000,taxCents:0,driveMinutes:54};const before=JSON.stringify(quote);
 requirePublicAmounts(quote,['feeCents','taxCents']);assert.equal(JSON.stringify(quote),before);
 for(const value of [null,undefined,'bad',Infinity,-1])assert.throws(()=>requirePublicAmounts({feeCents:value},['feeCents']));
});
test('shared public delivery summary and mobile notice omit travel details',()=>{
 const source=readFileSync('components/PartyRentalBookingClient.tsx','utf8');
 assert.doesNotMatch(source,/min estimated drive|deliveryDistanceBand|Math.ceil\(deliveryQuote.driveMinutes/);
 assert.match(source,/<span>Delivery<\/span>/);assert.match(source,/This delivery fee is included in your total and deposit/);
 const route=readFileSync('app/api/public-booking/[businessSlug]/rental-prices/route.ts','utf8');assert.match(route,/baseUnitPriceCents:price.dateAdjustedBasePriceCents/);
});
