import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTestSmsDestination } from "../app/app/admin/twilio/testSmsDestination.ts";

test("normalizes formatted and pasted US test-SMS destinations to E.164", () => {
 assert.equal(normalizeTestSmsDestination("(623) 363-9151"), "+16233639151");
 assert.equal(normalizeTestSmsDestination("+1 623-363-9151"), "+16233639151");
 assert.equal(normalizeTestSmsDestination("6233639151"), "+16233639151");
});
