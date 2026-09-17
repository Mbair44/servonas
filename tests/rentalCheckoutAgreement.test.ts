import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const checkout = readFileSync(new URL("../components/PartyRentalBookingClient.tsx", import.meta.url), "utf8");

test("one required rental agreement acknowledgement preserves existing backend fields", () => {
 assert.match(checkout, /name="agreementAccepted" value="true" required aria-required="true"/);
 assert.match(checkout, /name="depositAccepted" value=\{checkoutAgreementAccepted\?"true":"false"\}/);
 assert.match(checkout, /name="finalPaymentAccepted" value=\{checkoutAgreementAccepted\?"true":"false"\}/);
 assert.match(checkout, /name="cancellationPolicyAccepted" value=\{checkoutAgreementAccepted\?"true":"false"\}/);
 assert.match(checkout, /Rental Agreement/);
 assert.match(checkout, /Deposit\/Cancellation Policy/);
});

test("rental checkout presents payment totals before its agreement and CTA", () => {
 assert.match(checkout, /Due today <strong>\{money\(onlinePaymentsReady\?deposit:0\)\}<\/strong>/);
 assert.match(checkout, /Remaining after event <strong>\{money\(onlinePaymentsReady\?total-deposit:total\)\}<\/strong>/);
 assert.match(checkout, /Total <strong>\{money\(total\)\}<\/strong>/);
 assert.match(checkout, /Book & pay \$\{money\(deposit\)\}/);
});
