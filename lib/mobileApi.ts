import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { MembershipRole, MobileCapability, Workspace } from "@servonas/shared";

type MobileErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_FAILED"
  | "CONFLICT" | "PRECONDITION_FAILED" | "RATE_LIMITED" | "REQUEST_TOO_LARGE"
  | "UNSUPPORTED_VERSION" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";

type MembershipRow = { business_id: string; role: string; businesses: { id: string; name: string } | null };
type MembershipQueryRow = Omit<MembershipRow, "businesses"> & { businesses: { id: string; name: string }[] | null };
type TechnicianRow = { business_id: string; id: string; employee_id: string | null; is_active: boolean; is_technician: boolean; can_be_assigned_jobs: boolean };
type EmployeeRow = { business_id: string; id: string; auth_user_id: string | null; is_active: boolean };

export class MobileApiError extends Error {
  readonly code: MobileErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: MobileErrorCode,
    message: string,
    status: number,
    retryable = false,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
export type MobileAuthorizationContext = {
  accessToken: string;
  user: User;
  supabase: SupabaseClient;
  workspaces: Workspace[];
  techniciansByBusinessId: Map<string, { id: string; employeeId: string }>;
};

const membershipRoles = new Set<MembershipRole>(["owner", "admin", "manager", "staff"]);

export function newMobileRequestId() { return randomUUID(); }

/** Only accepts a single RFC 6750 Bearer credential; cookies are intentionally ignored. */
export function parseMobileBearerToken(request: Request): string {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new MobileApiError("UNAUTHENTICATED", "A valid bearer token is required.", 401);
  return match[1];
}

function mobileSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new MobileApiError("SERVICE_UNAVAILABLE", "Mobile authentication is unavailable.", 503, true);
  return { url, anonKey };
}

/**
 * getUser(token) contacts Supabase Auth and verifies the presented credential
 * server-side. It deliberately does not inspect decoded JWT claims locally.
 */
export async function verifyMobileBearerToken(accessToken: string): Promise<User> {
  const { url, anonKey } = mobileSupabaseConfiguration();
  const verifier = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.getUser(accessToken);
  if (error || !data.user) throw new MobileApiError("UNAUTHENTICATED", "The bearer token is invalid or expired.", 401);
  return data.user;
}

/** RLS-bound client for ordinary tenant data. Never replace this with getSupabaseAdmin(). */
export function createMobileRlsClient(accessToken: string): SupabaseClient {
  const { url, anonKey } = mobileSupabaseConfiguration();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function mobileCapabilitiesFor(role: MembershipRole, technicianEligible: boolean): MobileCapability[] {
  const capabilities: MobileCapability[] = [];
  if (role === "owner" || role === "admin" || role === "manager") capabilities.push("operational_dashboard");
  if (role === "owner" || role === "admin") capabilities.push("financial_dashboard");
  if (technicianEligible) capabilities.push(
    "assigned_jobs_read", "assigned_job_notes_write", "assigned_job_photos_write",
    "assigned_job_lifecycle_transition", "foreground_location_share",
  );
  return capabilities;
}

export function projectMobileWorkspaces(
  memberships: MembershipRow[], technicians: TechnicianRow[], employees: EmployeeRow[], userId: string,
): { workspaces: Workspace[]; techniciansByBusinessId: Map<string, { id: string; employeeId: string }> } {
  const activeEmployees = new Set(employees
    .filter((employee) => employee.auth_user_id === userId && employee.is_active)
    .map((employee) => `${employee.business_id}:${employee.id}`));
  const techniciansByBusinessId = new Map<string, { id: string; employeeId: string }>();
  for (const technician of technicians) {
    if (!technician.employee_id || !technician.is_active || !technician.is_technician || !technician.can_be_assigned_jobs) continue;
    if (!activeEmployees.has(`${technician.business_id}:${technician.employee_id}`)) continue;
    techniciansByBusinessId.set(technician.business_id, { id: technician.id, employeeId: technician.employee_id });
  }
  const workspaces: Workspace[] = [];
  for (const membership of memberships) {
    if (!membershipRoles.has(membership.role as MembershipRole) || !membership.businesses) continue;
    const membershipRole = membership.role as MembershipRole;
    const technicianEligible = techniciansByBusinessId.has(membership.business_id);
    workspaces.push({
      id: membership.businesses.id,
      displayName: membership.businesses.name,
      membershipRole,
      technicianEligible,
      availableCapabilities: mobileCapabilitiesFor(membershipRole, technicianEligible),
    });
  }
  return { workspaces, techniciansByBusinessId };
}

function normalizeMemberships(rows: MembershipQueryRow[]): MembershipRow[] {
  return rows.map((row) => ({ ...row, businesses: row.businesses?.[0] ?? null }));
}

export async function createMobileAuthorizationContext(request: Request): Promise<MobileAuthorizationContext> {
  const accessToken = parseMobileBearerToken(request);
  const user = await verifyMobileBearerToken(accessToken);
  const supabase = createMobileRlsClient(accessToken);
  const [membershipsResult, techniciansResult, employeesResult] = await Promise.all([
    supabase.from("business_members").select("business_id,role,businesses(id,name)").eq("user_id", user.id),
    supabase.from("technician_profiles").select("business_id,id,employee_id,is_active,is_technician,can_be_assigned_jobs").eq("member_user_id", user.id),
    supabase.from("employees").select("business_id,id,auth_user_id,is_active").eq("auth_user_id", user.id),
  ]);
  if (membershipsResult.error || techniciansResult.error || employeesResult.error) {
    console.error("mobile_authorization_context_resolution_failed", {
      userId: user.id,
      membershipCode: membershipsResult.error?.code ?? null,
      technicianCode: techniciansResult.error?.code ?? null,
      employeeCode: employeesResult.error?.code ?? null,
    });
    throw new MobileApiError("SERVICE_UNAVAILABLE", "Mobile authorization is temporarily unavailable.", 503, true);
  }
  const { workspaces, techniciansByBusinessId } = projectMobileWorkspaces(
    normalizeMemberships((membershipsResult.data ?? []) as MembershipQueryRow[]),
    (techniciansResult.data ?? []) as TechnicianRow[],
    (employeesResult.data ?? []) as EmployeeRow[],
    user.id,
  );
  return { accessToken, user, supabase, workspaces, techniciansByBusinessId };
}

export function requireMobileWorkspace(context: MobileAuthorizationContext, businessId: string): Workspace {
  const workspace = context.workspaces.find((candidate) => candidate.id === businessId);
  if (!workspace) throw new MobileApiError("FORBIDDEN", "You do not have access to this workspace.", 403);
  return workspace;
}

/** Future job routes must call this in addition to requireMobileWorkspace(). */
export async function requireMobileJobAssignment(context: MobileAuthorizationContext, businessId: string, jobId: string) {
  requireMobileWorkspace(context, businessId);
  const technician = context.techniciansByBusinessId.get(businessId);
  if (!technician) throw new MobileApiError("FORBIDDEN", "Technician access is required for this job.", 403);
  const { data, error } = await context.supabase.from("job_assignments")
    .select("assignment_role")
    .eq("business_id", businessId).eq("job_id", jobId).eq("technician_id", technician.id).eq("is_active", true).maybeSingle();
  if (error) {
    console.error("mobile_job_assignment_resolution_failed", { userId: context.user.id, businessId, code: error.code });
    throw new MobileApiError("SERVICE_UNAVAILABLE", "Job authorization is temporarily unavailable.", 503, true);
  }
  if (!data) throw new MobileApiError("FORBIDDEN", "You are not assigned to this job.", 403);
  return { assignmentRole: data.assignment_role as "primary" | "helper", technicianId: technician.id };
}
