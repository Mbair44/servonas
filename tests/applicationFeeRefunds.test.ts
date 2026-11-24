import test from "node:test";
import assert from "node:assert/strict";
import {proportionalFeeRefund} from "../lib/pricing/applicationFeeRefunds.ts";

test("application-fee refunds use cumulative proportional rounding",()=>{
 assert.equal(proportionalFeeRefund(300,10_000,0,2_500,0),75);
 assert.equal(proportionalFeeRefund(300,10_000,2_500,2_500,75),75);
 assert.equal(proportionalFeeRefund(300,10_000,5_000,5_000,150),150);
});
test("application-fee refunds cannot exceed captured fee",()=>{
 assert.equal(proportionalFeeRefund(99,1_000,900,500,89),10);
 assert.throws(()=>proportionalFeeRefund(99,0,0,1,0));
});
