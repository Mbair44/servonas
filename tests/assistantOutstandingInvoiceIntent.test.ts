import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {classifyBillingIntent} from "../lib/assistant/billingIntent.ts";

const globalPhrases=[
 "Do I have any unpaid invoices?","Do I have unpaid invoices?","Show me outstanding invoices.","Who owes me money?","Who still owes me money?","How much is outstanding?","How much am I still owed?","Any overdue invoices?","What bills haven't been paid?","Who hasn't paid?","Do I have any unpaid bills?","Anyone still owe me money?","What's still outstanding?","How much am I owed?"
];

for(const phrase of globalPhrases)test(`global outstanding: ${phrase}`,()=>assert.equal(classifyBillingIntent(phrase),"outstanding_invoices_global"));

test("selected customer references remain customer scoped",()=>{for(const phrase of ["Does this customer owe me anything?","What unpaid invoices does he have?","Does Matthew owe me money?","Does he have any open invoices?","Does she have an open invoice?","Do they have open invoices?"])assert.equal(classifyBillingIntent(phrase),"outstanding_invoices_customer",phrase);});
test("specific selected-invoice status is not classified as a global balance query",()=>assert.equal(classifyBillingIntent("Is this invoice paid?"),"invoice_status"));

test("global outstanding routing precedes provider and ignores selected entity binding",async()=>{
 const code=await readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8"),globalRoute=code.indexOf('else if(globalOutstanding)decision={toolName:"getOutstandingInvoices",arguments:{}}'),provider=code.indexOf("provider.generateResponse");
 assert.ok(globalRoute>=0&&globalRoute<provider);
 assert.match(code,/if\(selectedCustomerId&&!globalOutstanding&&!createType\)decision=bindTrustedSelectedCustomer/);
 assert.match(code,/if\(selectedInvoiceId&&!globalOutstanding\)decision=bindTrustedSelectedInvoice/);
 assert.match(code,/selectedCustomerId&&!globalOutstanding&&!decision\.arguments\.customerId/);
 assert.match(code,/selectedInvoiceId&&!globalOutstanding&&!decision\.arguments\.invoiceId/);
});

test("pending ambiguity is superseded by the current global outstanding intent",async()=>{const code=await readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8");assert.match(code,/supersedesPending=Boolean\(customerSearchTerm\|\|markPaidIntent==="action"\|\|globalSchedule\|\|globalOutstanding\)/);});
test("outstanding intent family is read-only and cannot route mutations",async()=>{const code=await readFile(new URL("../lib/assistant/billingIntent.ts",import.meta.url),"utf8");assert.doesNotMatch(code,/sendInvoice|markInvoicePaid|create|refund/i);});
test("voice and text share the same billing classifier in the shared orchestrator",async()=>{const code=await readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8");assert.match(code,/channel:"web"\|"mobile"\|"voice"/);assert.equal((code.match(/billingIntent=classifyBillingIntent\(text\)/g)??[]).length,1);});
