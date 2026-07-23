import assert from "node:assert/strict";
import test from "node:test";
import { classifyInvitationDelivery, invitationDeliveryMessage } from "../lib/invitationDelivery.ts";

test("reports configured, successful Supabase Auth invitations as sent", () => {
  const outcome = classifyInvitationDelivery({ adminConfigured: true, hasAuthUser: true, hasError: false });
  assert.equal(outcome, "sent");
  assert.equal(invitationDeliveryMessage(outcome), "Invitation email sent");
});

test("distinguishes unavailable delivery from provider failure", () => {
  assert.equal(
    invitationDeliveryMessage(classifyInvitationDelivery({ adminConfigured: false, hasAuthUser: false, hasError: false })),
    "Invitation saved, but email delivery is not configured",
  );
  assert.equal(
    invitationDeliveryMessage(classifyInvitationDelivery({ adminConfigured: true, hasAuthUser: false, hasError: true })),
    "Invitation saved, but email delivery failed",
  );
});
