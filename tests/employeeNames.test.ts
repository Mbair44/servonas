import assert from "node:assert/strict";
import test from "node:test";
import {relatedPreferredName} from "../lib/employeeNames.ts";

test("uses the live employee preferred-name relation",()=>{
 assert.equal(relatedPreferredName({preferred_name:"  Sam  "}),"Sam");
 assert.equal(relatedPreferredName([{preferred_name:"Alex"}]),"Alex");
});
test("never derives an employee name from email",()=>{
 assert.equal(relatedPreferredName(null),"Team member");
});
