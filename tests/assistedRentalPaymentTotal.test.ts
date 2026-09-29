import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
test('payment request charges the full booking deposit and carries the full multi-item total',async()=>{
 const sessions:any[]=[];
 const rows:Record<string,any>={bookings:{id:'booking',business_id:'tenant',job_id:'job',booking_number:123,status:'pending_payment',deposit_cents:20500,amount_paid_cents:0,total_cents:41000,customers:{},businesses:{name:'Business'}},business_payment_accounts:{provider_account_id:'acct',charges_enabled:true,onboarding_status:'complete',payouts_enabled:true}};
 const db={from(table:string){const q:any={};for(const method of ['select','eq','maybeSingle','update'])q[method]=()=>q;q.then=(resolve:any)=>resolve({data:rows[table]??null,error:null});return q;}};
 const modules:Record<string,any>={'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},'@/lib/stripeConnect':{stripeClient:()=>({checkout:{sessions:{create:async(body:any)=>{sessions.push(body);return {id:'session',url:'https://stripe.test'};}}}})},'@/lib/twilio/messageUsage':{},'@/lib/emailDeliveryMode':{rentalEmailDeliveryIsLive:()=>false},'@/lib/bookingManage/tokens':{createBookingPaymentRequestToken:async()=> 'token'},'@/lib/smsConsent':{resolveCurrentSmsConsent:()=>({canSendSms:false,reason:'phone_missing'})}};
 const exports:any={};runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/communications/rentalPaymentRequest.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>modules[id],process:{env:{NEXT_PUBLIC_SITE_URL:'https://example.test'}}});
 await exports.createRentalDepositPaymentRequest('booking');assert.equal(sessions.length,1);assert.equal(sessions[0].line_items[0].price_data.unit_amount,20500);assert.equal(sessions[0].metadata.total_cents,'41000');
});
