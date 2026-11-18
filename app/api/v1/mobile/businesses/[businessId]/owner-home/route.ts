import { ownerManagerDashboardDataSchema } from "@servonas/shared";
import { createMobileAuthorizationContext, MobileApiError, newMobileRequestId, requireMobileWorkspace } from "@/lib/mobileApi";
import { handleMobileApiError, mobileError, mobileSuccess } from "@/lib/mobileApiResponse";
import { active, localDayBounds, mobileBusiness, requireOffice, summary } from "@/lib/mobileReadModels";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const requestId = newMobileRequestId();
  try {
    const { businessId } = await params, context = await createMobileAuthorizationContext(request), workspace = requireMobileWorkspace(context, businessId);
    requireOffice(workspace); const business = await mobileBusiness(context, businessId), day = localDayBounds(business.timezone);
    const [jobsResult, techResult] = await Promise.all([
      context.supabase.from("jobs").select("id,business_id,job_number,title,status,priority,starts_at,arrival_window_start,arrival_window_end,service_address,assigned_technician_id,booking_source,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),services!jobs_service_tenant_fk(name),service_locations!jobs_service_location_tenant_fk(street_address,city,state)").eq("business_id", businessId).eq("is_deleted", false).gte("starts_at", day.start).lt("starts_at", day.end).order("starts_at").limit(100),
      context.supabase.from("technician_profiles").select("id,technician_status").eq("business_id", businessId).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true),
    ]);
    if (jobsResult.error || techResult.error) throw new MobileApiError("SERVICE_UNAVAILABLE", "Dashboard data is temporarily unavailable.", 503, true);
    const jobs = jobsResult.data ?? [], allActive = jobs.filter((job: any) => active.includes(job.status));
    const operational = { asOfDate: day.date, timezone: business.timezone, jobsToday: jobs.filter((job: any) => !["canceled", "declined"].includes(job.status)).length,
      inProgressJobs: jobs.filter((job: any) => ["en_route", "arrived", "in_progress"].includes(job.status)).length,
      unassignedJobs: allActive.filter((job: any) => !job.assigned_technician_id).length,
      pendingBookings: jobs.filter((job: any) => job.status === "pending" && job.booking_source === "website").length,
      techniciansWorking: (techResult.data ?? []).filter((tech: any) => ["assigned", "en_route", "on_site"].includes(tech.technician_status)).length,
      todayJobs: jobs.filter((job: any) => !["canceled", "declined"].includes(job.status)).map((job: any) => { const value: any = summary(job); delete value.assignmentRole; return value; }), };
    const data = ownerManagerDashboardDataSchema.parse({ workspace, generatedAt: new Date().toISOString(), operational, financial: null });
    return mobileSuccess(data, requestId);
  } catch (error) { return handleMobileApiError(error, requestId); }
}
const unsupported = () => mobileError(new MobileApiError("NOT_FOUND", "This method is not supported.", 405), newMobileRequestId(), { headers: { allow: "GET" } });
export const POST = unsupported; export const PUT = unsupported; export const PATCH = unsupported; export const DELETE = unsupported;
