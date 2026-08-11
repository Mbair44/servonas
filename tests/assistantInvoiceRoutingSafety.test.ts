import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {bindTrustedSelectedCustomer,bindTrustedSelectedInvoice,classifyInvoiceSendIntent} from "../lib/assistant/selectedCustomerContext.ts";

const invoiceId="22222222-2222-4222-8222-222222222222",customerId="11111111-1111-4111-8111-111111111111";
const badProvider={toolName:"sendInvoice",arguments:{invoiceId}} as const;
const route=(text:string)=>bindTrustedSelectedInvoice(text,badProvider,invoiceId) as any;
const tools=()=>readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");
const orchestrator=()=>readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8");

test("when did I send that invoice is always read only",()=>assert.equal(route("When did I send that invoice?").toolName,"getInvoiceActivity"));
test("when was that invoice sent is always read only",()=>assert.equal(route("When was that invoice sent?").toolName,"getInvoiceActivity"));
test("did I send it is always read only",()=>assert.equal(route("Did I send it?").toolName,"getInvoiceActivity"));
test("when was it last sent is always read only",()=>assert.equal(route("When was it last sent?").toolName,"getInvoiceActivity"));
test("explicit resend is classified as a mutation",()=>assert.equal(classifyInvoiceSendIntent("Resend that invoice."),"explicit"));
test("send it again is classified as a mutation",()=>assert.equal(classifyInvoiceSendIntent("Send it again."),"explicit"));
test("please email an invoice again is classified as a mutation",()=>assert.equal(classifyInvoiceSendIntent("Please email INV-000001 again."),"explicit"));
test("ambiguous invoice send asks for clarification and does not mutate",()=>{assert.equal(classifyInvoiceSendIntent("Invoice send?"),"ambiguous");const result=route("Invoice send?");assert.ok("response" in result);assert.match(result.response,/see when.*or resend/i);});
test("server guard checks current utterance before executing send",async()=>{const code=await tools();assert.match(code,/classifyInvoiceSendIntent\(c\.currentInput/);});
test("same request ID is claimed through the unique action infrastructure",async()=>{const code=await tools();assert.match(code,/idempotency_key:idempotencyKey/);assert.match(code,/claimed\.error\.code!=="23505"/);});
test("a new explicit resend receives a new client request ID",async()=>{const code=await readFile(new URL("../app/app/[businessSlug]/assistant/AssistantClient.tsx",import.meta.url),"utf8");assert.match(code,/const requestId=crypto\.randomUUID\(\)/);assert.match(code,/channel:"web",requestId/);});
test("have they ever paid me forces payment history",()=>assert.equal((bindTrustedSelectedCustomer("Have they ever paid me?",{response:"generic"},customerId) as any).toolName,"getPaymentHistory"));
test("next appointment cannot short circuit to a generic response",()=>assert.equal((bindTrustedSelectedCustomer("When is their next appointment?",{response:"generic"},customerId) as any).toolName,"getCustomerAppointments"));
test("cross tenant protection remains in invoice execution",async()=>assert.match(await tools(),/requireSelectedCustomerMatch\(c,invoice\.customer_id\)/));
test("selected invoice remains tenant revalidated",async()=>assert.match(await orchestrator(),/from\("invoices"\).*eq\("business_id",context\.business\.id\)/));
test("every listed historical delivery question is classified read only",()=>{for(const phrase of ["Did I send that invoice?","Was that invoice sent?","Has it been delivered?","How many times was it sent?","What date was it emailed?","What happened with that invoice?","When did I email it?"])assert.equal(classifyInvoiceSendIntent(phrase),"read_only",phrase);});
