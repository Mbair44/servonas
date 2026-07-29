import assert from "node:assert/strict";
import test from "node:test";
import {customerWriteErrorMessage} from "../lib/crmValidation.ts";

test("customer write errors identify required fields",()=>{
 assert.equal(customerWriteErrorMessage({code:"23502",message:'null value in column "first_name" violates not-null constraint'},"created"),"First name is required.");
 assert.equal(customerWriteErrorMessage({code:"23502",message:'null value in column "customer_type" violates not-null constraint'},"created"),"The customer could not be created. Customer type is required.");
});

test("customer write errors explain schema and constraint failures",()=>{
 assert.match(customerWriteErrorMessage({code:"23514"},"created"),/customer data rules/);
 assert.match(customerWriteErrorMessage({code:"42703"},"created"),/migration/);
 assert.match(customerWriteErrorMessage({code:"XX000"},"created"),/Reference code: XX000/);
});
