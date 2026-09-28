import test from "node:test";
import assert from "node:assert/strict";
import { bookingFollowUpBody } from "../lib/communications/bookingFollowUpBody.ts";
const details = { businessName: "Copper State", firstName: "Miriam", balanceCents: 12550, manageUrl: "https://example.com/manage-booking/secure" };
test("balance text includes the exact remainder and both requested links", () => {
 const body = bookingFollowUpBody({ ...details, reviewUrl: "https://g.page/r/example/review" });
 assert.match(body, /Hi Miriam/);
 assert.match(body, /remaining balance is \$125\.50/);
 assert.ok(body.includes(details.manageUrl));
 assert.ok(body.includes("https://g.page/r/example/review"));
 assert.match(body, /honest Google review/);
 assert.match(body, /Reply STOP/);
});
test("paid bookings do not request another payment", () => {
 const body = bookingFollowUpBody({ ...details, balanceCents: 0 });
 assert.match(body, /thank you for your payment/);
 assert.doesNotMatch(body, /remaining balance|pay securely|Google review|undefined/);
});
test("unnamed customers receive a clean greeting and review requests are optional", () => {
 const body = bookingFollowUpBody({ ...details, firstName: "" });
 assert.match(body, /^Copper State: your remaining/);
 assert.doesNotMatch(body, /Hi ,|Google review/);
});
