import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/assistedRentalItems.ts';
const source=readFileSync(new URL('../app/app/[businessSlug]/assisted-booking/actions.ts',import.meta.url),'utf8');
function fixture(fail=false){
 const calls:any[]=[],jobs:string[]=[],payments:string[]=[];
 const items=[{id:'a',name:'Monsoon',daily_price_cents:22500,allow_quantity:true,stock_quantity:2},{id:'b',name:'Castle',daily_price_cents:18500,allow_quantity:false,stock_quantity:1}];
 const query:any={select:()=>query,eq:()=>query,then:(resolve:any)=>resolve({data:items,error:null})};
 const db={from:()=>query,rpc:async(name:string,args:any)=>{calls.push({name,args});return fail?{error:{message:'Castle is already reserved for that rental period.'}}:{data:{booking_id:'booking',booking_number:123}};}};
 const modules:Record<string,any>={
  '@/lib/workspace':{requireWorkspaceCapability:async()=>({supabase:db,business:{id:'tenant',name:'Business',industry_profile:'party_rental'},role:'owner'})},
  '@/lib/access':{canManageCustomers:()=>true},'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},
  '@/lib/rentalBookingJob':{ensureRentalBookingJob:async(_:unknown,id:string)=>jobs.push(id)},
  '@/lib/communications/rentalPaymentRequest':{createRentalDepositPaymentRequest:async(id:string)=>{payments.push(id);return {expiresAt:'2035-01-01',smsSent:true};}},
  '@/lib/smsConsent':{STAFF_BOOKING_SMS_CONSENT_VERSION:'version',webBookingSmsConsentDisclosure:()=> 'disclosure'},
  '@/lib/assistedRentalItems':pricing,
 };
 const exports:any={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>modules[id]});
 const form=new FormData();for(const [k,v] of Object.entries({rentalItems:JSON.stringify([{inventoryItemId:'a',quantity:1,unitPriceCents:22500},{inventoryItemId:'b',quantity:1,unitPriceCents:18500}]),discount:'50',delivery:'50',tax:'0',deposit:'205',rentalDate:'2035-01-01',requestKey:'request',firstName:'Test',lastName:'Customer',email:'test@example.com',phone:'555',address:'123 Main',city:'Mesa',zip:'85201',smsConsent:'true'}))form.set(k,v);
 return {calls,jobs,payments,form,run:()=>exports.createEmergencyAssistedBooking('business',form)};
}
test('action sends all rentals and staff consent in one tenant-scoped atomic call before job/payment',async()=>{
 const f=fixture();const result=await f.run();assert.ok(result.url);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'create_assisted_rental_booking');assert.equal(f.calls[0].args.p_business_id,'tenant');assert.equal(f.calls[0].args.p_items.length,2);assert.equal(f.calls[0].args.p_details.deposit,20500);assert.equal(f.calls[0].args.p_details.smsConsent,true);assert.deepEqual(f.jobs,['booking']);assert.deepEqual(f.payments,['booking']);
});
test('availability failure returns item name without redirect or payment and preserves submitted data',async()=>{const f=fixture(true);const before=Array.from(f.form.entries());const result=await f.run();assert.match(result.error,/Castle/);assert.equal(result.url,undefined);assert.deepEqual(f.jobs,[]);assert.deepEqual(f.payments,[]);assert.deepEqual(Array.from(f.form.entries()),before);});
test('foreign item and malformed amount fail before any reservation',async()=>{const f=fixture();f.form.set('rentalItems',JSON.stringify([{inventoryItemId:'foreign',quantity:1,unitPriceCents:1}]));assert.ok((await f.run()).error);assert.equal(f.calls.length,0);});

test('shared job builder includes all rental name snapshots and quantities',async()=>{
 const writes:any[]=[];
 const booking={id:'booking',business_id:'tenant',customer_id:'customer',event_start_time:'09:00',event_end_time:'17:00',delivery_address:'123 Main',subtotal_cents:41000,total_cents:41000,bookings_items:[{rental_date:'2035-01-01',quantity:1,item_name_snapshot:'Monsoon',inventory_items:{name:'Renamed item'}},{rental_date:'2035-01-01',quantity:1,item_name_snapshot:'Castle',inventory_items:{name:'Castle'}}]};
 const db={from(table:string){const q:any={};let inserted=false;for(const method of ['select','eq','is','limit','maybeSingle','single','update'])q[method]=()=>q;q.insert=(value:unknown)=>{writes.push(value);inserted=true;return q;};q.then=(resolve:any)=>resolve({data:table==='bookings'?booking:table==='businesses'?{timezone:'America/Phoenix'}:table==='service_locations'?{id:'location'}:inserted?{id:'job'}:null,error:null});return q;}};
 const exports:any={};runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/rentalBookingJob.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({zonedDateTimeToUtc:(date:string,time:string)=>new Date(`${date}T${time}:00Z`)})});
 await exports.ensureRentalBookingJob(db,'booking');assert.equal(writes.length,1);assert.match(writes[0].description,/Monsoon × 1/);assert.match(writes[0].description,/Castle × 1/);assert.doesNotMatch(writes[0].description,/Renamed item/);
});
