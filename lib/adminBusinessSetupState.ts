export type OwnerAccessStatus = "not_invited" | "invited" | "activated";
export type CustomerType = "standard" | "pilot" | "internal_test";

export function normalizeCustomerType(value: string | null | undefined): CustomerType {
  return value === "pilot" || value === "internal_test" ? value : "standard";
}

export function ownerAccessLabel(status: OwnerAccessStatus, at?: string | null) {
  const formatted = at
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(at))
    : null;
  if (status === "activated") return formatted ? `Activated ${formatted}` : "Activated";
  if (status === "invited") return formatted ? `Invitation sent ${formatted}` : "Invitation sent";
  return "Not invited";
}

export function businessAdminStatus(input: {
  lifecycleStatus?: string | null;
  ownerStatus: OwnerAccessStatus;
}) {
  if (input.lifecycleStatus === "deactivated") return "Suspended";
  if (input.ownerStatus === "activated") return "Active";
  if (input.ownerStatus === "invited") return "Invite sent";
  return "Setup";
}
