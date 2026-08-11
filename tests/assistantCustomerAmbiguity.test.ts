import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {pendingCustomerConversationContext,resolveCustomerCandidateAgainstTenant,resolveCustomerCandidateSelection,selectCustomerConversationContext,type CustomerCandidate} from "../lib/assistant/customerCandidateResolution.ts";

const candidates:CustomerCandidate[]=[{id:"11111111-1111-4111-8111-111111111111",displayName:"Matthew Bair",phoneLast4:"9151",email:"matthew@example.com"},{id:"22222222-2222-4222-8222-222222222222",displayName:"Test Address",phoneLast4:"9151",email:"test@example.com"}];
const selected=(phrase:string)=>{const result=resolveCustomerCandidateSelection(phrase,candidates);assert.equal(result.kind,"selected");return result.candidate.id;};

test("numeric selection 1 resolves the first persisted candidate",()=>assert.equal(selected("1"),candidates[0].id));
test("numeric selection 2 and punctuation resolve the second persisted candidate",()=>{assert.equal(selected("2"),candidates[1].id);assert.equal(selected("2."),candidates[1].id);});
test("the first one resolves naturally",()=>assert.equal(selected("the first one"),candidates[0].id));
test("the second one resolves naturally",()=>{assert.equal(selected("the second one"),candidates[1].id);assert.equal(selected("go with the second one"),candidates[1].id);});
test("number 2 resolves naturally",()=>{assert.equal(selected("number 2"),candidates[1].id);assert.equal(selected("number two"),candidates[1].id);});
test("displayed customer name resolves uniquely",()=>{assert.equal(selected("Test Address"),candidates[1].id);assert.equal(selected("the Test Address one"),candidates[1].id);assert.equal(selected("Matthew Bair"),candidates[0].id);});
test("an out-of-range number returns the available candidate count",()=>assert.deepEqual(resolveCustomerCandidateSelection("3",candidates),{kind:"invalid_number",count:2}));
test("a stale candidate is rejected after tenant-scoped revalidation",async()=>assert.deepEqual(await resolveCustomerCandidateAgainstTenant("2",candidates,async()=>null),{kind:"stale"}));
test("a cross-tenant candidate cannot become selected",async()=>{const currentTenant=new Set([candidates[0].id]);const result=await resolveCustomerCandidateAgainstTenant("2",candidates,async id=>currentTenant.has(id)?{id,displayName:"Matthew Bair"}:null);assert.deepEqual(result,{kind:"stale"});});
test("selected customer context persists while pending candidates are cleared",()=>{const pending=pendingCustomerConversationContext({channelState:"kept"},candidates),next=selectCustomerConversationContext(pending,candidates[1].id);assert.equal(next.selectedCustomerId,candidates[1].id);assert.deepEqual(next.pendingCustomerCandidates,[]);assert.equal(next.channelState,"kept");});
test("choosing another customer replaces selected-customer context",()=>{const first=selectCustomerConversationContext({},candidates[0].id),second=selectCustomerConversationContext(first,candidates[1].id);assert.equal(first.selectedCustomerId,candidates[0].id);assert.equal(second.selectedCustomerId,candidates[1].id);});
test("orchestrator persists candidates and resolves them before asking the provider",async()=>{const source=await readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8"),tools=await readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");assert.match(source,/pendingCustomerCandidates/);assert.match(source,/resolveCustomerCandidateAgainstTenant/);assert.match(source,/\.eq\("business_id",context\.business\.id\)/);assert.match(source,/\.eq\("is_deleted",false\)/);assert.match(tools,/customerCandidates:candidates/);});
