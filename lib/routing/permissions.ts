export type RouteCapability =
  | "view_all_routes" | "view_own_route" | "view_route_map"
  | "recalculate_routes" | "reorder_stops" | "reassign_jobs"
  | "lock_route_stops" | "run_optimization" | "apply_optimization"
  | "view_technician_origins" | "edit_technician_origins"
  | "view_route_reporting" | "view_route_audit";

const officeRoles = new Set(["owner", "admin", "manager", "platform_admin"]);
const ownerAdminRoles = new Set(["owner", "admin", "platform_admin"]);

export function hasRouteCapability(role: string | null | undefined, capability: RouteCapability) {
  if (capability === "view_own_route") return Boolean(role);
  if (capability === "view_technician_origins" || capability === "edit_technician_origins") {
    return ownerAdminRoles.has(role ?? "");
  }
  return officeRoles.has(role ?? "");
}

export function canReadTenantRoute({
  role, sessionBusinessId, recordBusinessId, currentUserId, technicianUserId,
}: {
  role: string | null | undefined; sessionBusinessId: string | null;
  recordBusinessId: string; currentUserId: string | null; technicianUserId?: string | null;
}) {
  if (!sessionBusinessId || sessionBusinessId !== recordBusinessId || !currentUserId) return false;
  if (officeRoles.has(role ?? "")) return true;
  return Boolean(technicianUserId && technicianUserId === currentUserId);
}
