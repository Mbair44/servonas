import assert from "node:assert/strict";
import test from "node:test";
import {cancellationPolicyError,DEFAULT_CANCELLATION_POLICY} from "../lib/cancellationPolicy.ts";

const policy={cancellation_policy_enabled:true,cancellation_policy_text:DEFAULT_CANCELLATION_POLICY,require_cancellation_acknowledgment:true};
test("enabled policies require explicit acknowledgment",()=>{
 for(const value of [undefined,false,"false","on",1])assert.match(cancellationPolicyError(policy,value,DEFAULT_CANCELLATION_POLICY)!,/acknowledge/);
 for(const value of [true,"true"])assert.equal(cancellationPolicyError(policy,value,DEFAULT_CANCELLATION_POLICY),null);
});
test("disabled or absent policies preserve checkout",()=>{
 assert.equal(cancellationPolicyError(null,undefined,undefined),null);
 assert.equal(cancellationPolicyError({...policy,cancellation_policy_enabled:false},false,"old"),null);
});
test("optional acknowledgment does not block checkout",()=>{
 assert.equal(cancellationPolicyError({...policy,require_cancellation_acknowledgment:false},undefined,DEFAULT_CANCELLATION_POLICY),null);
});
test("changed or missing policy snapshots require another review",()=>{
 for(const snapshot of [undefined,"old policy",""])assert.match(cancellationPolicyError(policy,true,snapshot)!,/changed/);
});
test("tenant policies are checked against that tenant's exact text",()=>{
 const other={...policy,cancellation_policy_text:"Another tenant's cancellation terms"};
 assert.match(cancellationPolicyError(other,true,DEFAULT_CANCELLATION_POLICY)!,/changed/);
 assert.equal(cancellationPolicyError(other,true,other.cancellation_policy_text),null);
});
