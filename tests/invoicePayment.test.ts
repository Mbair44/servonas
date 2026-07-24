import assert from "node:assert/strict";
import test from "node:test";
import { invoicePaymentAmount,InvoicePaymentAmountError } from "../lib/invoicePayment.ts";

const base={
  balanceDueCents:10_000,
  depositRequiredCents:2_500,
  netPaidCents:0,
  allowPartialPayments:true,
  minimumPartialPaymentCents:1_000,
};

test("full payment uses the current balance",()=>{
  assert.equal(invoicePaymentAmount({...base,purpose:"balance"}),10_000);
});

test("deposit payment collects only the remaining required deposit",()=>{
  assert.equal(invoicePaymentAmount({...base,purpose:"deposit",netPaidCents:500}),2_000);
});

test("deposit cannot be collected twice",()=>{
  assert.throws(()=>invoicePaymentAmount({...base,purpose:"deposit",netPaidCents:2_500}),InvoicePaymentAmountError);
});

test("partial payment enforces opt-in, minimum, and current balance",()=>{
  assert.equal(invoicePaymentAmount({...base,purpose:"partial",requestedPartialCents:1_500}),1_500);
  assert.throws(()=>invoicePaymentAmount({...base,purpose:"partial",requestedPartialCents:999}),/at least/);
  assert.throws(()=>invoicePaymentAmount({...base,purpose:"partial",requestedPartialCents:10_001}),/cannot exceed/);
  assert.throws(()=>invoicePaymentAmount({...base,purpose:"partial",requestedPartialCents:1_500,allowPartialPayments:false}),/not enabled/);
});
