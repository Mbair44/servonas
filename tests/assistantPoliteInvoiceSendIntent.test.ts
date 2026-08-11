import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {bindTrustedSelectedInvoice,classifyInvoiceSendIntent} from "../lib/assistant/selectedCustomerContext.ts";

const invoiceId="22222222-2222-4222-8222-222222222222";
const routed=(input:string)=>bindTrustedSelectedInvoice(input,{response:"provider response"},invoiceId) as any;

for(const [index,input] of [
 "Will you resend the invoice?",
 "Can you resend it?",
 "Could you resend that invoice?",
 "Would you send it again?",
 "Can you send that invoice again?",
 "Could you email the invoice again?",
 "Can you please resend it?",
].entries())test(`${index+1}. polite action sends: ${input}`,()=>{assert.equal(classifyInvoiceSendIntent(input),"explicit");assert.equal(routed(input).toolName,"sendInvoice");assert.equal(routed(input).arguments.invoiceId,invoiceId);const wrongProvider=bindTrustedSelectedInvoice(input,{toolName:"getInvoiceActivity",arguments:{}},invoiceId) as any;assert.equal(wrongProvider.toolName,"sendInvoice");assert.equal(wrongProvider.arguments.invoiceId,invoiceId);});

for(const [index,input] of [
 "Did you send the invoice?",
 "When did you send it?",
 "Was it sent?",
 "Has it been sent?",
 "Have you sent it?",
 "When was it last sent?",
 "How many times was it sent?",
].entries())test(`${index+8}. historical question stays read only: ${input}`,()=>{assert.equal(classifyInvoiceSendIntent(input),"read_only");assert.equal(routed(input).toolName,"getInvoiceActivity");assert.notEqual(routed(input).toolName,"sendInvoice");});

test("15. ambiguous invoice send asks for clarification",()=>{const result=routed("Invoice send?");assert.equal(classifyInvoiceSendIntent("Invoice send?"),"ambiguous");assert.ok("response" in result);assert.match(result.response,/see when.*or resend/i);});

test("15b. explicit resend without selected invoice asks which invoice",async()=>{const code=await readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8");assert.match(code,/invoiceSendIntent==="explicit"/);assert.match(code,/Which invoice do you want me to send\?/);});

test("16. retrying the same request ID is protected by one unique action claim",async()=>{const code=await readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");assert.match(code,/idempotency_key:idempotencyKey/);assert.match(code,/claimed\.error\.code!=="23505"/);assert.match(code,/already processing/);});

test("17. a new explicit submission receives a new request ID",async()=>{const code=await readFile(new URL("../app/app/[businessSlug]/assistant/AssistantClient.tsx",import.meta.url),"utf8");assert.match(code,/const requestId=crypto\.randomUUID\(\)/);assert.match(code,/channel:"web",requestId/);});
