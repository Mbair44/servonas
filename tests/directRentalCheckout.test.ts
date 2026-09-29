import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {requirePublicAmounts} from '../lib/publicBookingNumbers.ts';

function fixture(){
 const source=readFileSync('components/PartyRentalBookingClient.tsx','utf8');
 const fn=source.split('\n').find(line=>line.includes('async function completeBooking('))!;
 const requests:any[]=[],errors:string[]=[],redirects:string[]=[];
 let resolve!:(value:any)=>void;
 const pending=new Promise(r=>{resolve=r;});
 const context:any={checkoutInFlight:{current:false},promoPending:false,date:'2026-10-03',startTime:'09:00',endDate:'2026-10-03',endTime:'17:00',requestRentalPeriod:()=>({endDate:'2026-10-03',endTime:'17:00'}),selected:[{id:'rental'}],priced:()=>({}),trackBookingFunnel:()=>{},businessSlug:'tenant',flowSource:'date_first',setBookingError:(s:string)=>errors.push(s),setSubmitting:()=>{},total:23500,deposit:11750,onlinePaymentsReady:true,cancellationPolicy:null,weatherPolicy:'weather',waiverPolicy:'waiver',appliedPromo:null,attributionSessionId:'session',bookingAttributionSession:()=>'',quantities:{rental:1},operatorFor:()=>false,optionSelections:{},setUpdatedQuote:(q:any)=>{context.quote=q;},setConfirmedTotal:()=>{},setInvoiceLaterConfirmation:()=>{},window:{location:{assign:(url:string)=>redirects.push(url)}},fetch:async(_url:string,options:any)=>{requests.push(JSON.parse(options.body));return pending;}};
 context.deliveryStatus='ready';context.requirePublicAmounts=requirePublicAmounts;
 runInNewContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
 const data=new FormData();data.set('agreementAccepted','true');data.set('depositAccepted','true');data.set('finalPaymentAccepted','true');
 return {context,data,requests,errors,redirects,resolve,submit:()=>context.completeBooking(data)};
}
test('accepted terms go directly to Stripe and rapid duplicate submission is ignored',async()=>{
 const f=fixture();const first=f.submit();await f.submit();assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].acceptedTotalCents,23500);assert.equal(f.requests[0].acceptedDepositCents,11750);
 assert.equal(f.requests[0].depositAccepted,'true');assert.equal(f.requests[0].finalPaymentAccepted,'true');
 f.resolve({ok:true,json:async()=>({url:'https://checkout.stripe.com/test'})});await first;
 assert.deepEqual(f.redirects,['https://checkout.stripe.com/test']);assert.equal(f.context.checkoutInFlight.current,true);
});
test('missing agreement never starts checkout',async()=>{const f=fixture();f.data.delete('agreementAccepted');await f.submit();assert.equal(f.requests.length,0);assert.match(f.errors[0],/accept the rental agreement/);});
test('changed server price is displayed without automatic retry or redirect',async()=>{
 const f=fixture();const first=f.submit();f.resolve({ok:true,json:async()=>({requiresPriceReview:true,subtotalCents:18500,discountCents:5000,deliveryFeeCents:10000,taxCents:1080,totalCents:24580,depositCents:12290,remainingBalanceCents:12290})});await first;
 assert.equal(f.context.quote.totalCents,24580);assert.equal(f.requests.length,1);assert.equal(f.redirects.length,0);assert.equal(f.context.checkoutInFlight.current,false);assert.match(f.errors.at(-1)!,/submit again/);
});
