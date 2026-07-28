import type { EntitlementSummary } from "@/lib/entitlements/service";

const statusCopy = {
  scheduled: "Servonas access for this workspace has not started yet. Existing data remains available.",
  expired: "Your Servonas access has expired. Your data is safe, but new changes are currently limited.",
  suspended: "Access to this Servonas workspace is temporarily suspended. Contact support for assistance.",
  canceled: "Servonas access is inactive. Existing workspace data remains preserved.",
  superseded: "This access record has been replaced. Contact support if the current access is not shown.",
} as const;

export function EntitlementBanner({summary}:{summary:EntitlementSummary}) {
  const status=summary.effectiveStatus;
  if(status==="active"||status==="grace_period") {
    if(status!=="grace_period")return null;
    return <div className="entitlement-banner grace" role="status">Your Servonas access is temporarily in a grace period. Your data remains available.</div>;
  }
  const message=status?statusCopy[status as keyof typeof statusCopy]:"This workspace does not currently have Servonas access. Existing data remains preserved.";
  return <div className="entitlement-banner inactive" role="alert">{message}</div>;
}
