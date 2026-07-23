import assert from "node:assert/strict";
import test from "node:test";
import {
  isPotentialCustomerDuplicate,
  isValidCrmEmail,
  isValidCrmPhone,
} from "../lib/crmValidation.ts";

test("validates optional and formatted customer contact details", () => {
  assert.equal(isValidCrmEmail(""), true);
  assert.equal(isValidCrmEmail("customer@example.com"), true);
  assert.equal(isValidCrmEmail("not-an-email"), false);
  assert.equal(isValidCrmPhone("(602) 555-0123"), true);
  assert.equal(isValidCrmPhone("555-12"), false);
});

test("warns on case-insensitive email and normalized phone duplicates", () => {
  const existing = { email: "Customer@Example.com", phone: "+1 602 555 0123" };
  assert.equal(isPotentialCustomerDuplicate(existing, "customer@example.com", ""), true);
  assert.equal(isPotentialCustomerDuplicate(existing, "", "(602) 555-0123"), true);
  assert.equal(isPotentialCustomerDuplicate(existing, "other@example.com", "4805550199"), false);
});
