export type InvitationDeliveryOutcome = "sent" | "not_configured" | "failed";

export function invitationDeliveryMessage(outcome: InvitationDeliveryOutcome) {
  if (outcome === "sent") return "Invitation email sent";
  if (outcome === "not_configured") return "Invitation saved, but email delivery is not configured";
  return "Invitation saved, but email delivery failed";
}

export function classifyInvitationDelivery({
  adminConfigured,
  hasAuthUser,
  hasError,
}: {
  adminConfigured: boolean;
  hasAuthUser: boolean;
  hasError: boolean;
}): InvitationDeliveryOutcome {
  if (!adminConfigured) return "not_configured";
  return !hasError && hasAuthUser ? "sent" : "failed";
}
