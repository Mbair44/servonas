export const workspaceRoles = ["owner", "admin", "manager", "staff"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export function canManageBusiness(role: string | null | undefined) { return role === "owner" || role === "admin"; }
export function canManageCustomers(role: string | null | undefined) { return role === "owner" || role === "admin" || role === "manager"; }
export function validWorkspaceSlug(value: string) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
export function safeNextPath(value: string | null | undefined, fallback = "/app") { return value?.startsWith("/") && !value.startsWith("//") ? value : fallback; }
