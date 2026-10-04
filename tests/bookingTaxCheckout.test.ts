import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {calculateBookingTax} from '../lib/bookingTax.ts';

// Execute the real route, replacing only I/O and unrelated rental pricing dependencies.
function checkoutFixture({payLater=false,providerFailure=false,inactiveTax=false,persistenceFailure=false}={}){
 const diagnosticCalls:unknown[][]=[];
 const writes:Array<{table:string;value:Record<string,any>}>=[],payments:any[]=[],rpcCalls:string[]=[],providerLines:any[]=[];
 const rows:Record<string,any>={booking_settings:{business_id:'tenant',rental_deposit_percent:50,timezone:'America/Phoenix'},businesses:{id:'tenant',name:'Tenant'},business_website_settings:null,delivery_fee_settings:{enabled:true,delivery_taxable:false},booking_availability:[{start_time:'00:00',end_time:'23:59'}],booking_blackouts:[],business_payment_accounts:{provider_account_id:'acct_tenant'},inventory_items:[{id:'rental',business_id:'tenant',daily_price_cents:18500,stock_quantity:1,is_taxable:true}],inventory_item_booking_options:[],business_billing_settings:{tax_enabled:true,tax_calculation_method:'automatic',tax_display_mode:'exclusive',default_tax_rate_basis_points:620,default_invoice_item_taxable:true},customers:{id:'customer',tax_exempt:false},bookings:{customer_id:'customer'},booking_items:[{id:'line',inventory_item_id:'rental',unit_price_cents:18500,date_pricing_snapshot:{dateAdjustedBasePriceCents:18500,originalBasePriceCents:18500}}]};
 const db={from(table:string){let value:Record<string,any>|undefined;const query:any={};for(const method of ['select','eq','ilike','in','match','lt','gt','limit','maybeSingle','single'])query[method]=()=>query;query.update=(v:Record<string,any>)=>{value=v;return query;};query.then=(resolve:(r:unknown)=>unknown)=>{if(value)writes.push({table,value});return Promise.resolve(resolve({data:value?null:rows[table],error:persistenceFailure&&value?.tax_snapshot&&table==='bookings'?{message:'write failed'}:null}));};return query;},async rpc(name:string){rpcCalls.push(name);return {data:name==='create_public_booking_quantities_timed'?{booking_id:'new-booking',booking_number:123}:null,error:null};}};
 const noop=async()=>({ok:true});
 const modules:Record<string,unknown>={
  'next/server':{NextResponse:{json:(value:unknown,init?:ResponseInit)=>Response.json(value,init)}},
  stripe:class{checkout={sessions:{create:async(body:unknown,options:unknown)=>{payments.push({body,options});return {id:'cs_test',url:'https://checkout.stripe.com/test'};}}};},
  '@/lib/bookingTax':{calculateBookingTax},
  '@/lib/stripeTaxCodes':{resolveRentalStripeTaxCode:({itemTaxCode,categoryTaxCode,businessDefaultTaxCode}:any)=>({taxCode:itemTaxCode??categoryTaxCode??businessDefaultTaxCode??null,source:null})},
  '@/lib/bookingTaxDiagnostics':{bookingTaxLineDiagnostics:()=>[]},
  '@/lib/bookingTaxProvider':{logInactiveBookingTaxSettings:async(...args:unknown[])=>{diagnosticCalls.push(args);},bookingTaxProvider:()=>async(lines:any[])=>{providerLines.push(lines);if(providerFailure)throw Object.assign(Error('offline'),{code:inactiveTax?'stripe_tax_inactive':'other'});return {calculationId:'calc_test',lines:lines.map(line=>({id:line.id,taxCents:Math.round(line.amountCents*.08)}))};}},
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},
  '@/lib/stripeConnect':{stripePaymentsReady:()=>!payLater},
  '@/lib/googleAddress':{verifyGooglePlace:async()=>({streetAddress:'123 Main',city:'Mesa',postalCode:'85201',state:'AZ',country:'US'})},
  '@/lib/cancellationPolicy':{cancellationPolicyError:()=>null},
  '@/lib/rentalPolicies':{DEFAULT_WEATHER_POLICY:'weather',DEFAULT_RENTAL_WAIVER_POLICY:'waiver'},
  '@/lib/rentalDatePricing':{resolveRentalDatePrice:async()=>({dateAdjustedBasePriceCents:18500,originalBasePriceCents:18500})},
  '@/lib/rentalPricing':{calculateRentalCalendarDays:()=>1,applyRentalDatePrice:(p:unknown)=>({...p as object,totalUnitPriceCents:18500}),resolveRentalPricingRules:()=>({}),resolveRentalDurationRules:()=>({standardRentalHours:24}),rentalDurationAdjustment:()=>({durationAdjustmentCents:0})},
  '@/lib/rentalOperators':{operatorCharge:()=>({chargeCents:0,selected:false})},
  '@/lib/discounts':{validateRentalPromo:async()=>({ok:true,discountCents:5000,code:'SAVE',snapshot:{}})},
  '@/lib/deliveryQuote':{quoteBusinessDelivery:async()=>({eligible:true,feeCents:10000,taxCents:0,snapshot:{rule:{taxable:false}}}),deliveryQuoteMessage:()=>''},
  '@/lib/bookingTime':{zonedDateTimeToUtc:(date:string,time:string)=>new Date(`${date}T${time}:00Z`)},
  '@/lib/bookingFunnel':{recordBookingFunnelEvent:noop,snapshotBookingAttribution:noop,validSessionId:()=>false},
  '@/lib/rentalBookingJob':{ensureRentalBookingJob:async()=>null},
  '@/lib/communications/rentalBookingEmailService':{sendRentalBookingConfirmationEmail:noop,sendRentalBookingBusinessNotification:noop},
  '@/lib/communications/rentalBookingConfirmationSms':{sendRentalBookingConfirmationSms:noop},
  '@/lib/smsConsent':{webBookingSmsConsentDisclosure:()=>'',WEB_BOOKING_SMS_CONSENT_VERSION:'test'},
 };
 const exports:any={};const code=ts.transpileModule(readFileSync(new URL('../app/api/checkout/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 runInNewContext(code,{exports,require:(name:string)=>{if(!(name in modules))throw Error(`Unexpected dependency ${name}`);return modules[name];},process:{env:{STRIPE_SECRET_KEY:'test',GOOGLE_MAPS_API_KEY:'test',NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:'test'}},console});
 const body={businessSlug:'tenant',items:[{inventoryItemId:'rental',quantity:1}],rentalDate:'2026-10-03',rentalEndDate:'2026-10-03',firstName:'Test',lastName:'Customer',email:'test@example.com',phone:'123',address:'123 Main',city:'Mesa',zipCode:'85201',startTime:'09:00',endTime:'17:00',agreementAccepted:true,depositAccepted:true,finalPaymentAccepted:true,weatherPolicyText:'weather',rentalWaiverPolicyText:'waiver',promoCode:'SAVE',googlePlaceId:'place'};
 const post=(extra={})=>exports.POST(new Request('https://example.com/api/checkout',{method:'POST',body:JSON.stringify({...body,...extra})})) as Promise<Response>;
 return {post,writes,payments,rpcCalls,providerLines,diagnosticCalls};
}
test('real checkout reviews first, then persists tax and charges precisely the reviewed deposit',async()=>{
 const f=checkoutFixture();const review=await (await f.post()).json();assert.equal(review.totalCents,24580);assert.equal(review.depositCents,12290);assert.equal(f.writes.length,0);assert.equal(f.rpcCalls.length,0);assert.equal(f.payments.length,0);
 const result=await f.post({acceptedTotalCents:review.totalCents,acceptedDepositCents:review.depositCents});assert.equal(result.status,200);
 const saved=f.writes.find(row=>row.table==='bookings'&&row.value.tax_snapshot)!.value;
 assert.equal(f.diagnosticCalls.length,0);assert.equal(saved.tax_cents,1080);assert.equal(saved.total_cents,24580);assert.equal(saved.taxable_subtotal_cents,13500);assert.equal(saved.deposit_cents,12290);assert.equal(saved.balance_due_cents,12290);
 assert.equal(f.payments[0].body.line_items[0].price_data.unit_amount,saved.deposit_cents);assert.equal(f.payments[0].body.metadata.total_cents,String(saved.total_cents));assert.equal(f.payments[0].options.stripeAccount,'acct_tenant');
 assert.equal(f.providerLines[0][0].amountCents,13500);assert.equal(f.providerLines[0].length,1);
});
test('real invoice-later checkout stores full tax-inclusive balance without a Stripe payment',async()=>{const f=checkoutFixture({payLater:true});const review=await (await f.post()).json();assert.equal(review.depositCents,0);const result=await (await f.post({acceptedTotalCents:review.totalCents,acceptedDepositCents:0})).json();assert.equal(result.paymentMode,'invoice_later');assert.equal(f.payments.length,0);const confirmed=f.writes.find(row=>row.value.status==='confirmed'&&row.table==='bookings')!.value;assert.equal(confirmed.balance_due_cents,24580);});
test('tax provider outage continues with zero tax and records an audit marker',async()=>{const f=checkoutFixture({providerFailure:true});const review=await (await f.post()).json();assert.equal(review.totalCents,23500);assert.equal(review.taxCents,0);const result=await f.post({acceptedTotalCents:review.totalCents,acceptedDepositCents:review.depositCents});assert.equal(result.status,200);const saved=f.writes.find(row=>row.table==='bookings'&&row.value.tax_snapshot)!.value;assert.equal(f.diagnosticCalls.length,0);assert.equal(saved.tax_cents,0);assert.equal(saved.total_cents,23500);assert.equal(saved.tax_snapshot.taxCalculationStatus,'automatic_failed');assert.equal(f.payments[0].body.line_items[0].price_data.unit_amount,11750);});
test('tax snapshot persistence failure expires the new hold before payment',async()=>{const f=checkoutFixture({persistenceFailure:true});assert.equal((await f.post({acceptedTotalCents:24580,acceptedDepositCents:12290})).status,500);assert.equal(f.payments.length,0);assert.ok(f.writes.some(row=>row.table==='bookings'&&row.value.status==='expired'));});
test('stale accepted total is reviewed again without creating a booking',async()=>{const f=checkoutFixture();const response=await (await f.post({acceptedTotalCents:23500,acceptedDepositCents:11750})).json();assert.equal(response.requiresPriceReview,true);assert.equal(f.rpcCalls.length,0);});

test('inactive automatic tax still completes checkout with zero tax and unchanged deposit',async()=>{const f=checkoutFixture({providerFailure:true,inactiveTax:true});const response=await f.post({acceptedTotalCents:23500,acceptedDepositCents:11750});assert.equal(response.status,200);assert.deepEqual(f.diagnosticCalls,[['tenant','acct_tenant']]);const saved=f.writes.find(row=>row.table==='bookings'&&row.value.tax_snapshot)!.value;assert.equal(saved.tax_cents,0);assert.equal(saved.tax_snapshot.taxCalculationStatus,'automatic_failed');assert.equal(f.payments.length,1);assert.equal(f.payments[0].body.line_items[0].price_data.unit_amount,11750);});
