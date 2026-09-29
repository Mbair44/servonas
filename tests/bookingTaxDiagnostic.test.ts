import test from 'node:test';
import assert from 'node:assert/strict';
import {logInactiveBookingTaxSettings} from '../lib/bookingTaxProvider.ts';

const businessId='cb25acc0-3623-4c06-9041-89a88f4ad6ed';
const accountId='acct_1U1bNhF1apbWeAN2';

test('diagnostic retrieves connected settings read-only and logs only approved fields',async(t)=>{
 const logs:unknown[][]=[];
 t.mock.method(console,'info',(...args:unknown[])=>logs.push(args));
 const settings={status:'pending',status_details:{pending:{missing_fields:['head_office']}},head_office:null,defaults:{tax_code:'txcd_10000000',extra:'secret'},livemode:true,secret:'do not log'};
 let calls=0;
 await logInactiveBookingTaxSettings(businessId,accountId,()=>({tax:{settings:{retrieve:async(params:unknown,options:unknown)=>{
  calls++;
  assert.deepEqual(params,{});
  assert.deepEqual(options,{stripeAccount:accountId,timeout:5000,maxNetworkRetries:0});
  return settings;
 }}}}) as never);
 assert.equal(calls,1);
 assert.deepEqual(logs,[["Checkout Stripe Tax settings diagnostic",{
  operation:'automatic_booking_tax_settings_diagnostic',businessId,accountId,
  status:settings.status,status_details:settings.status_details,head_office:null,
  defaults:{tax_code:'txcd_10000000'},livemode:true,
 }]]);
});

test('diagnostic failure cannot escape or log SDK error secrets',async(t)=>{
 const logs:unknown[][]=[];
 t.mock.method(console,'warn',(...args:unknown[])=>logs.push(args));
 await assert.doesNotReject(logInactiveBookingTaxSettings(businessId,accountId,()=>{throw Error('secret token or customer data');}));
 assert.deepEqual(logs,[["Checkout Stripe Tax settings diagnostic unavailable",{
  operation:'automatic_booking_tax_settings_diagnostic',businessId,accountId,
 }]]);
});

test('temporary diagnostic skips other businesses and absent connected accounts',async()=>{
 let calls=0;
 const client=()=>{calls++;throw Error('must not run');};
 await logInactiveBookingTaxSettings('another-business',accountId,client);
 await logInactiveBookingTaxSettings(businessId,null,client);
 assert.equal(calls,0);
});
