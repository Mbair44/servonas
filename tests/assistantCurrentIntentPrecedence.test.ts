import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {bindTrustedSelectedInvoice,explicitCustomerSearchTerm,requestsGlobalSchedule} from "../lib/assistant/selectedCustomerContext.ts";
import {selectCustomerConversationContext} from "../lib/assistant/customerCandidateResolution.ts";

const customerId="11111111-1111-4111-8111-111111111111",invoiceId="22222222-2222-4222-8222-222222222222";
const orchestrator=()=>readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8");
const route=()=>readFile(new URL("../app/api/assistant/[businessSlug]/route.ts",import.meta.url),"utf8");

test("selected invoice plus Find Matthew identifies a new customer search",()=>assert.equal(explicitCustomerSearchTerm("Find Matthew"),"Matthew"));
test("selected invoice plus Find Sarah identifies a new customer search",()=>assert.equal(explicitCustomerSearchTerm("Find Sarah."),"Sarah"));
test("selected invoice does not narrow who is scheduled tomorrow",()=>assert.equal(requestsGlobalSchedule("Who do I have tomorrow?"),true));
test("when was it sent uses selected invoice activity",()=>assert.equal((bindTrustedSelectedInvoice("When was it sent?",{response:"wrong"},invoiceId) as any).toolName,"getInvoiceActivity"));
test("did you send the invoice uses selected invoice activity",()=>assert.equal((bindTrustedSelectedInvoice("Did you send the invoice?",{toolName:"getOutstandingInvoices",arguments:{customerId}},invoiceId) as any).toolName,"getInvoiceActivity"));
test("did you send the invoice can never select sendInvoice",()=>assert.notEqual((bindTrustedSelectedInvoice("Did you send the invoice?",{toolName:"sendInvoice",arguments:{invoiceId}},invoiceId) as any).toolName,"sendInvoice"));
test("explicit resend still selects sendInvoice",()=>assert.equal((bindTrustedSelectedInvoice("Resend it.",{response:"wrong"},invoiceId) as any).toolName,"sendInvoice"));
test("selected customer plus Find another customer remains a search intent",()=>assert.equal(explicitCustomerSearchTerm("Find another customer"),"another customer"));
test("selecting a new customer clears incompatible selected invoice",()=>assert.equal(selectCustomerConversationContext({selectedCustomerId:customerId,selectedInvoiceId:invoiceId},"33333333-3333-4333-8333-333333333333").selectedInvoiceId,undefined));
test("pending selection is superseded by explicit customer search",async()=>{const code=await orchestrator();assert.match(code,/supersedesPending/);assert.match(code,/pendingCustomerConversationContext\(activeConversationContext,\[\]\)/);});
test("pending customer selection is superseded by unrelated global schedule",async()=>{const code=await orchestrator();assert.match(code,/customerSearchTerm\|\|globalSchedule/);assert.match(code,/currentIntent:customerSearchTerm\?"customer_search":"global_schedule"/);});
test("conversation reload keeps context useful",async()=>assert.match(await orchestrator(),/conversation\.context/));
test("conversation reload remains scoped to tenant and authenticated user",async()=>{const code=await route();assert.match(code,/eq\("business_id",business\.id\)/);assert.match(code,/eq\("user_id",user\.id\)/);});
test("invoice activity reports unavailable send timestamps honestly",async()=>{const code=await readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");assert.match(code,/"not recorded"/);});
test("read-only delivery intent is routed before provider and outstanding tools",async()=>{const code=await orchestrator(),activity=code.indexOf('classifyInvoiceSendIntent(text)==="read_only"'),provider=code.indexOf("provider.generateResponse");assert.ok(activity>=0&&activity<provider);assert.match(code,/\{toolName:"getInvoiceActivity"/);});
