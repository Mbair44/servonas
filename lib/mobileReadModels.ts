import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { MobileApiError, type MobileAuthorizationContext } from "@/lib/mobileApi";

const relation = <T,>(value: T | T[] | null | undefined) => Array.isArray(value) ? value[0] ?? null : value ?? null;
const active = ["pending", "confirmed", "scheduled", "dispatched", "en_route", "arrived", "in_progress"];

export function localDayBounds(timezone: string, now = new Date()) {
  const date = dateInTimeZone(now, timezone), next = addDays(date, 1);
  return { date, start: zonedDateTimeToUtc(date, "00:00", timezone).toISOString(), end: zonedDateTimeToUtc(next, "00:00", timezone).toISOString() };
}

export function summary(row: any, assignmentRole: "primary" | "helper" = "primary") {
  const customer = relation(row.customers), service = relation(row.services), location = relation(row.service_locations);
  return { id: row.id, businessId: row.business_id, jobNumber: Number(row.job_number), title: row.title, status: row.status, priority: row.priority,
    startsAt: row.starts_at, arrivalWindowStart: row.arrival_window_start, arrivalWindowEnd: row.arrival_window_end,
    customerDisplayName: customer ? customer.company_name || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null : null,
    serviceName: service?.name ?? null,
    serviceAddress: row.service_address || (location ? [location.street_address, location.city, location.state].filter(Boolean).join(", ") : null), assignmentRole };
}

export async function mobileBusiness(context: MobileAuthorizationContext, businessId: string) {
  const { data, error } = await context.supabase.from("businesses").select("id,name,timezone").eq("id", businessId).eq("is_deleted", false).maybeSingle();
  if (error) throw new MobileApiError("SERVICE_UNAVAILABLE", "Workspace data is temporarily unavailable.", 503, true);
  if (!data) throw new MobileApiError("NOT_FOUND", "Workspace not found.", 404);
  return { id: data.id, name: data.name, timezone: data.timezone || "America/Phoenix" };
}

export function requireOffice(workspace: { membershipRole: string }) {
  if (!["owner", "admin", "manager"].includes(workspace.membershipRole)) throw new MobileApiError("FORBIDDEN", "Operational access is required.", 403);
}
export { active };
