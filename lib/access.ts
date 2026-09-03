export const workspaceRoles = ["owner", "admin", "manager", "staff"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export function canManageBusiness(role: string | null | undefined) { return role === "owner" || role === "admin" || role === "platform_admin"; }
export type ManagementAuthorizationSource = "workspace_membership" | "platform_admin" | "none";
export function managementAuthorizationSource(role: string | null | undefined, platformAdminAccess: boolean): ManagementAuthorizationSource {
 if (platformAdminAccess) return "platform_admin";
 return canManageBusiness(role) ? "workspace_membership" : "none";
}
export function canManageCustomers(role: string | null | undefined) { return role === "owner" || role === "admin" || role === "manager" || role === "platform_admin"; }
export function validWorkspaceSlug(value: string) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
export function safeNextPath(value: string | null | undefined, fallback = "/app") { return value?.startsWith("/") && !value.startsWith("//") ? value : fallback; }
