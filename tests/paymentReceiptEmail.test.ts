import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as receipt from "../lib/communications/paymentReceipt.ts";
const input={businessName:"Copper State Bounce",customerName:"Sam",invoiceNumber:"INV-1001",amountCents:5000,balanceCents:12500,currency:"USD",paidAt:"2026-10-12T15:00:00Z",method:"credit_card"};
test("receipt matches reservation styling and shows partial/full payment details",()=>{
 const partial=receipt.renderPaymentReceipt(input),full=receipt.renderPaymentReceipt({...input,balanceCents:0});
 assert.match(partial.html,/linear-gradient/);assert.match(partial.html,/Payment received!/);assert.match(partial.html,/\$50.00/);assert.match(partial.html,/\$125.00/);assert.match(partial.text,/credit card/);assert.match(full.html,/Paid in full/);assert.match(full.text,/October 12, 2026/);
});
test("receipt escapes customer and business content",()=>{
 const result=receipt.renderPaymentReceipt({...input,businessName:'<script>alert(1)</script>',customerName:'<img src=x>',invoiceNumber:'A&B'});
 assert.doesNotMatch(result.html,/<script>|<img/);assert.match(result.html,/A&amp;B/);
});
test("all successful payment notifications share one receipt identity",()=>{
 for(const event of receipt.paymentReceiptEvents)assert.equal(receipt.canonicalFinancialEmailEvent(event),"receipt_sent");
 assert.equal(receipt.canonicalFinancialEmailEvent("payment_failed"),"payment_failed");
});
async function serviceHarness(){
 const events:Record<string,any>[]=[],sent:Record<string,any>[]=[];
 const db={from(table:string){let operation="read",payload:Record<string,any>={};const filters:((r:Record<string,any>)=>boolean)[]=[];const q:any={select(){return q;},eq(k:string,v:unknown){filters.push(r=>r[k]===v);return q;},is(k:string,v:unknown){filters.push(r=>(r[k]??null)===v);return q;},in(k:string,values:unknown[]){filters.push(r=>values.includes(r[k]));return q;},limit(){return q;},insert(p:Record<string,any>){operation="insert";payload=p;return q;},update(p:Record<string,any>){operation="update";payload=p;return q;},single(){return Promise.resolve(run(true));},maybeSingle(){return Promise.resolve(run(true));},then(resolve:any,reject:any){return Promise.resolve(run(false)).then(resolve,reject);}};
 function run(single:boolean):{data:any;error:null}{
  if(table==="invoices")return {data:{id:"invoice",business_id:"csb",customer_id:"customer",invoice_number:input.invoiceNumber,currency:"USD",balance_due_cents:12500,businesses:{name:input.businessName,email:"booking@example.com"},customers:{first_name:"Sam",email:"customer@example.com"}},error:null};
  if(table==="customer_billing_profiles")return {data:null,error:null};
  if(table==="payments")return {data:{amount_cents:5000,payment_method_type:"card",paid_at:input.paidAt},error:null};
  let rows=events.filter(r=>filters.every(f=>f(r)));
  if(operation==="insert"){const row={id:`event-${events.length}`,...payload};events.push(row);rows=[row];}
  if(operation==="update")rows.forEach(r=>Object.assign(r,payload));
  return {data:single?rows[0]??null:rows,error:null};
 }return q;}};
 const source=await readFile(new URL("../lib/communications/invoiceEmailService.ts",import.meta.url),"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:Record<string,any>={};
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name.includes("supabaseAdmin")?{getSupabaseAdmin:()=>db}:name.includes("priceBook")?{formatCents:(n:number)=>`$${n/100}`} : receipt,process:{env:{RESEND_API_KEY:"test-key",EMAIL_FROM:"Servonas <test@example.com>"}},console:{info(){},error(){}},fetch:async(_url:string,options:{body:string;headers:Record<string,string>})=>{sent.push({body:JSON.parse(options.body),headers:options.headers});return {ok:true,json:async()=>({id:"email-id"})};}});
 return {send:exports.sendInvoiceFinancialEmail,events,sent};
}
test("processing plus webhook replay sends only one branded receipt per payment",async()=>{
 const h=await serviceHarness();
 await h.send("invoice","payment_succeeded",{paymentId:"payment-1"});
 await h.send("invoice","receipt_sent",{paymentId:"payment-1"});
 await h.send("invoice","partial_payment",{paymentId:"payment-1"});
 assert.equal(h.sent.length,1);assert.equal(h.events[0].event_type,"receipt_sent");
 assert.match(h.sent[0].body.html,/Amount paid/);assert.equal(h.sent[0].body.reply_to,"booking@example.com");assert.match(h.sent[0].body.from,/Copper State Bounce/);
 assert.ok(h.sent[0].headers["Idempotency-Key"]);
 await h.send("invoice","receipt_sent",{paymentId:"payment-2"});assert.equal(h.sent.length,2);
});
test("old payment-received audits suppress another automatic receipt, explicit resend works",async()=>{
 const h=await serviceHarness();h.events.push({id:"old",business_id:"csb",invoice_id:"invoice",payment_id:"payment-1",event_type:"payment_succeeded",status:"sent"});
 await h.send("invoice","receipt_sent",{paymentId:"payment-1"});assert.equal(h.sent.length,0);
 await h.send("invoice","receipt_sent",{paymentId:"payment-1",forceResend:true});assert.equal(h.sent.length,1);
});
test("failed payment retains its separate notification",async()=>{
 const h=await serviceHarness();await h.send("invoice","payment_failed",{paymentId:"payment-1"});
 assert.match(h.sent[0].body.subject,/Payment failed/);assert.doesNotMatch(h.sent[0].body.html,/You’re all paid up/);
});
