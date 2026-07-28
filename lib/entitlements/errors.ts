import type { CapabilityAccessResult } from "./evaluate";

const messages: Record<CapabilityAccessResult["reason"], string> = {
  allowed: "Access is available.",
  no_entitlement: "This workspace does not have active Servonas access.",
  scheduled: "Servonas access for this workspace has not started yet.",
  expired: "Your Servonas access has expired. Your data remains safe, but new changes are currently limited.",
  suspended: "Access to this Servonas workspace is temporarily suspended. Contact support for assistance.",
  canceled: "Servonas access for this workspace is inactive. Your existing data remains preserved.",
  superseded: "This access record has been replaced by a newer entitlement.",
  capability_not_included: "Your current Servonas access does not include this feature.",
  limit_reached: "This workspace has reached the current limit for this feature.",
  evaluation_failed: "Servonas access could not be verified. Try again or contact support.",
};

export class EntitlementAccessError extends Error {
  readonly access: CapabilityAccessResult;

  constructor(access: CapabilityAccessResult) {
    super(messages[access.reason]);
    this.name = "EntitlementAccessError";
    this.access = access;
  }
}

export class EntitlementEvaluationError extends Error {
  readonly code: string | null;

  constructor(code: string | null = null) {
    super(messages.evaluation_failed);
    this.name = "EntitlementEvaluationError";
    this.code = code;
  }
}

export function entitlementAccessMessage(result: CapabilityAccessResult) {
  return messages[result.reason];
}
