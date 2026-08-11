import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {bindTrustedSelectedCustomer,bindTrustedSelectedInvoice} from "../lib/assistant/selectedCustomerContext.ts";
import {clearSelectedCustomerConversationContext,selectCustomerConversationContext} from "../lib/assistant/customerCandidateResolution.ts";

const tools=()=>readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");
const orchestrator=()=>readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8");
const customerId="11111111-1111-4111-8111-111111111111",invoiceId="22222222-2222-4222-8222-222222222222";
const response={response:"generic"} as const;

test("payment history after customer selection uses actual payment records",()=>assert.equal((bindTrustedSelectedCustomer("show their payment history",response,customerId) as any).toolName,"getPaymentHistory"));
test("payment history is not substituted with outstanding invoices",()=>assert.notEqual((bindTrustedSelectedCustomer("what payments have they made?",response,customerId) as any).toolName,"getOutstandingInvoices"));
test("outstanding balance remains a separate intent",()=>assert.equal((bindTrustedSelectedCustomer("what do they owe?",response,customerId) as any).toolName,"getOutstandingInvoices"));
test("payment history after invoice selection uses the trusted invoice",()=>assert.deepEqual((bindTrustedSelectedInvoice("show payment history for that invoice",response,invoiceId) as any).arguments,{invoiceId}));
test("invoice activity follows selected invoice",()=>assert.equal((bindTrustedSelectedInvoice("when was that invoice sent?",response,invoiceId) as any).toolName,"getInvoiceActivity"));
test("invoice resend follows selected invoice",()=>assert.equal((bindTrustedSelectedInvoice("resend that invoice",response,invoiceId) as any).toolName,"sendInvoice"));
test("model invoice argument is replaced by trusted selected invoice",()=>{const result=bindTrustedSelectedInvoice("send it",{toolName:"sendInvoice",arguments:{invoiceId:"invented"}},invoiceId) as any;assert.equal(result.arguments.invoiceId,invoiceId);});
test("selected invoice is persisted in conversation context",async()=>assert.match(await orchestrator(),/selectedInvoiceId:toolResult\.selectedInvoiceId/));
test("selected invoice is revalidated against tenant",async()=>assert.match(await orchestrator(),/from\("invoices"\).*eq\("business_id",context\.business\.id\)/));
test("selected invoice must belong to selected customer",async()=>assert.match(await orchestrator(),/invoice\.customer_id===selectedCustomerId/));
test("changing customer clears selected invoice",()=>assert.equal(selectCustomerConversationContext({selectedCustomerId:"old",selectedInvoiceId:invoiceId},customerId).selectedInvoiceId,undefined));
test("reselecting same customer preserves selected invoice",()=>assert.equal(selectCustomerConversationContext({selectedCustomerId:customerId,selectedInvoiceId:invoiceId},customerId).selectedInvoiceId,invoiceId));
test("stale customer clearing also clears selected invoice",()=>assert.equal(clearSelectedCustomerConversationContext({selectedCustomerId:customerId,selectedInvoiceId:invoiceId}).selectedInvoiceId,undefined));
test("payment lookup is tenant and successful-status scoped",async()=>{const code=await tools();assert.match(code,/from\("payments"\).*eq\("business_id",c\.business\.id\).*in\("status",\["succeeded","partially_refunded","refunded"\]\)/);});
test("invoice activity reads events deliveries and payments",async()=>{const code=await tools();for(const table of ["invoice_events","financial_notification_events","payments"])assert.match(code,new RegExp(`from\\("${table}"\\)`));});
test("invoice delivery uses existing service and detects skipped delivery",async()=>{const code=await tools();assert.match(code,/sendInvoiceFinancialEmail/);assert.match(code,/delivery\.skipped/);});
test("resend is immediate medium risk without high-risk confirmation",async()=>{const code=await tools();assert.match(code,/name:"sendInvoice",risk:"medium"/);assert.doesNotMatch(code,/pendingAction:\{actionType:"sendInvoice"/);});
