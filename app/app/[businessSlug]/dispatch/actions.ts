"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { JobNotificationService } from "@/lib/communications/jobNotificationService";
import { availableJobTransitions, canTransitionJob, type JobStatus } from "@/lib/jobStatusTransitions";
import { validateJobSchedule } from "@/lib/jobScheduling";
import { requireWorkspace } from "@/lib/workspace";
import { calculateDailyRoutes } from "@/lib/routing/routeCalculationService";
import { publicRouteCalculationError } from "@/lib/routing/errors";
import { actualRouteImpactSummary, type RoadMetrics } from "@/lib/routing/impact";
import { isRouteEditConflict, parseRoutePlanVersion, ROUTE_EDIT_CONFLICT_MESSAGE } from "@/lib/routing/concurrency";
import { generateRouteOptimizationSuggestions } from "@/lib/routing/optimizationService";
import { hasRouteCapability } from "@/lib/routing/permissions";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const dispatchPath = (slug: string, date: string, kind: "error" | "success", message: string) =>
  `/app/${slug}/dispatch?date=${encodeURIComponent(date)}&${kind}=${encodeURIComponent(message)}`;

export async function calculateDispatchRoutes(slug: string, formData: FormData) {
  const { user, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  if (!hasRouteCapability(role,"recalculate_routes")) {
    console.warn("Route permission denied",{businessId:business.id,userId:user.id,operation:"recalculate_routes"});
    redirect(dispatchPath(slug, date, "error", "You do not have permission to calculate routes."));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(dispatchPath(slug, date, "error", "Choose a valid service date."));
  const admin = getSupabaseAdmin();
  if (!admin) redirect(dispatchPath(slug, date, "error", "Server routing persistence is not configured."));
  if (!process.env.GOOGLE_ROUTES_API_KEY) {
    redirect(dispatchPath(slug, date, "error", "Google Routes API is not configured."));
  }
  let result;
  try {
    result = await calculateDailyRoutes({
      admin,
      businessId: business.id,
      serviceDate: date,
      businessTimeZone: business.timezone,
      actorUserId: user.id,
    });
  } catch (error) {
    console.error("Daily route calculation failed", {
      businessId: business.id,
      serviceDate: date,
      reason: error instanceof Error ? error.message : String(error),
    });
    redirect(dispatchPath(slug, date, "error", publicRouteCalculationError(error)));
  }
  revalidatePath(`/app/${slug}/dispatch`);
  const message = result.failed || result.skipped || result.partial
    ? `Routes updated with warnings: ${result.calculated} calculated, ${result.cached} cached, ${result.partial} partial, ${result.failed + result.skipped} need attention.`
    : `Routes ready: ${result.calculated} calculated, ${result.cached} reused.`;
  redirect(dispatchPath(slug, date, "success", message));
}

export async function optimizeDispatchRoutes(slug: string, formData: FormData) {
  const { user, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  const routePlanId = text(formData, "routePlanId");
  const planVersion = parseRoutePlanVersion(formData.get("planVersion"));
  if (!hasRouteCapability(role,"run_optimization")) {
    console.warn("Route permission denied",{businessId:business.id,userId:user.id,operation:"run_optimization"});
    redirect(dispatchPath(slug, date, "error", "You do not have permission to optimize routes."));
  }
  if (!routePlanId || !planVersion) redirect(dispatchPath(slug, date, "error", "Calculate the current road routes before requesting suggestions."));
  const admin = getSupabaseAdmin();
  if (!admin || !process.env.GOOGLE_ROUTES_API_KEY) redirect(dispatchPath(slug, date, "error", "Google road routing is not configured."));
  try {
    const result = await generateRouteOptimizationSuggestions({
      admin, businessId: business.id, routePlanId, actorUserId: user.id, expectedPlanVersion: planVersion,
    });
    revalidatePath(`/app/${slug}/dispatch`);
    redirect(dispatchPath(slug, date, "success", result.suggestions
      ? `${result.suggestions} road-based route suggestion${result.suggestions === 1 ? "" : "s"} ready for review.`
      : "No safe road-based improvement was found. Current routes were not changed."));
  } catch (error) {
    console.error("Route optimization generation failed", {
      businessId: business.id, routePlanId,
      reason: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error && error.message.includes("changed while you were editing")
      ? ROUTE_EDIT_CONFLICT_MESSAGE : "Route suggestions could not be generated. Review routing configuration and logs.";
    redirect(dispatchPath(slug, date, "error", message));
  }
}

export async function decideDispatchRouteSuggestion(slug: string, suggestionId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  const decision = text(formData, "decision");
  const planVersion = parseRoutePlanVersion(formData.get("planVersion"));
  if (!hasRouteCapability(role,"apply_optimization") || !planVersion || !["accepted", "dismissed"].includes(decision)) {
    if(!hasRouteCapability(role,"apply_optimization"))console.warn("Route permission denied",{businessId:business.id,userId:user.id,operation:"apply_optimization"});
    redirect(dispatchPath(slug, date, "error", "The route-suggestion decision was invalid."));
  }
  const { data: suggestion } = await supabase.from("route_suggestions").select("payload").eq("business_id", business.id).eq("id", suggestionId).eq("status", "pending").maybeSingle();
  const { error } = await supabase.rpc("decide_route_suggestion", {
    p_business_id: business.id, p_suggestion_id: suggestionId,
    p_decision: decision, p_expected_plan_version: planVersion,
  });
  if (error) {
    console.error("Route suggestion decision failed", { code: error.code, message: error.message, businessId: business.id, suggestionId });
    redirect(dispatchPath(slug, date, "error", isRouteEditConflict(error) ? ROUTE_EDIT_CONFLICT_MESSAGE : "The route suggestion could not be updated."));
  }
  if (decision === "accepted") {
    const technicianId = typeof suggestion?.payload === "object" && suggestion.payload
      ? String((suggestion.payload as Record<string, unknown>).technicianId ?? "") : "";
    const admin = getSupabaseAdmin();
    if (technicianId && admin && process.env.GOOGLE_ROUTES_API_KEY) {
      try {
        await calculateDailyRoutes({
          admin, businessId: business.id, serviceDate: date, businessTimeZone: business.timezone,
          actorUserId: user.id, onlyTechnicianId: technicianId,
        });
      } catch (routeError) {
        console.error("Accepted optimization recalculation failed", {
          businessId: business.id, suggestionId,
          reason: routeError instanceof Error ? routeError.message : String(routeError),
        });
        revalidatePath(`/app/${slug}/dispatch`);
        redirect(dispatchPath(slug, date, "success", "Suggestion accepted. The affected route still needs recalculation."));
      }
    }
  }
  revalidatePath(`/app/${slug}/dispatch`);
  redirect(dispatchPath(slug, date, "success", decision === "accepted" ? "Suggestion accepted and route recalculated." : "Suggestion dismissed."));
}

export async function reorderDispatchRoute(slug: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  const technicianRouteId = text(formData, "technicianRouteId");
  const technicianId = text(formData, "technicianId");
  const planVersion = parseRoutePlanVersion(formData.get("planVersion"));
  if (!hasRouteCapability(role,"reorder_stops")) {
    console.warn("Route permission denied",{businessId:business.id,userId:user.id,operation:"reorder_stops"});
    redirect(dispatchPath(slug, date, "error", "You do not have permission to reorder routes."));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !technicianRouteId || !technicianId || !planVersion) {
    redirect(dispatchPath(slug, date, "error", "The route reorder request was incomplete."));
  }
  let orderedJobIds: string[];
  try {
    const parsed: unknown = JSON.parse(text(formData, "orderedJobIds"));
    orderedJobIds = Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
  } catch {
    orderedJobIds = [];
  }
  if (!orderedJobIds.length) redirect(dispatchPath(slug, date, "error", "No route stops were supplied."));
  const { data: previousRoute } = await supabase.from("technician_routes")
    .select("driving_distance_meters,driving_duration_seconds")
    .eq("business_id", business.id).eq("id", technicianRouteId).maybeSingle();
  const { error } = await supabase.rpc("reorder_technician_route_stops_versioned", {
    p_business_id: business.id,
    p_technician_route_id: technicianRouteId,
    p_ordered_job_ids: orderedJobIds,
    p_expected_plan_version: planVersion,
    p_confirm_active: text(formData, "confirmActive") === "yes",
  });
  if (error) {
    console.error("Manual route reorder failed", { code: error.code, message: error.message, businessId: business.id, technicianRouteId });
    const message = isRouteEditConflict(error) ? ROUTE_EDIT_CONFLICT_MESSAGE
      : error.code === "55000" ? error.message : "The route order could not be saved.";
    redirect(dispatchPath(slug, date, "error", message));
  }
  const admin = getSupabaseAdmin();
  if (!admin || !process.env.GOOGLE_ROUTES_API_KEY) {
    revalidatePath(`/app/${slug}/dispatch`);
    redirect(dispatchPath(slug, date, "success", "Stop order saved. The affected route is stale and needs road recalculation."));
  }
  try {
    await calculateDailyRoutes({
      admin, businessId: business.id, serviceDate: date, businessTimeZone: business.timezone,
      actorUserId: user.id, onlyTechnicianId: technicianId,
    });
    const { data: recalculatedRoute } = await admin.from("technician_routes")
      .select("driving_distance_meters,driving_duration_seconds")
      .eq("business_id", business.id).eq("id", technicianRouteId).maybeSingle();
    const oldDistance = previousRoute?.driving_distance_meters;
    const newDistance = recalculatedRoute?.driving_distance_meters;
    const oldDuration = previousRoute?.driving_duration_seconds;
    const newDuration = recalculatedRoute?.driving_duration_seconds;
    const impact = oldDistance !== null && oldDistance !== undefined && newDistance !== null && newDistance !== undefined
      && oldDuration !== null && oldDuration !== undefined && newDuration !== null && newDuration !== undefined
      ? ` Actual road impact: ${Math.abs(oldDistance - newDistance) < 50 ? "no material mileage change" : `${(Math.abs(oldDistance - newDistance) / 1609.344).toFixed(1)} ${newDistance < oldDistance ? "fewer" : "additional"} miles`}; ${Math.abs(oldDuration - newDuration) < 30 ? "no material drive-time change" : `${Math.max(1, Math.round(Math.abs(oldDuration - newDuration) / 60))} ${newDuration < oldDuration ? "fewer" : "additional"} minutes`}.`
      : "";
    revalidatePath(`/app/${slug}/dispatch`);
    redirect(dispatchPath(slug, date, "success", `Stop order saved and the affected technician route was recalculated.${impact}`));
  } catch (calculationError) {
    console.error("Reordered technician route calculation failed", {
      businessId: business.id, technicianId,
      reason: calculationError instanceof Error ? calculationError.message : String(calculationError),
    });
    revalidatePath(`/app/${slug}/dispatch`);
    redirect(dispatchPath(slug, date, "success", "Stop order saved, but its road route could not be recalculated."));
  }
}

async function updateTechnicianOperationalState(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
  businessId: string,
  technicianId: string | null,
  status: JobStatus,
) {
  if (!technicianId) return;
  const technicianStatus = status === "en_route" ? "en_route"
    : status === "arrived" || status === "in_progress" ? "on_site"
      : status === "dispatched" || status === "scheduled" ? "assigned"
        : status === "completed" ? "available" : null;
  if (!technicianStatus) return;
  const { error } = await supabase.from("technician_profiles").update({ technician_status: technicianStatus }).eq("id", technicianId).eq("business_id", businessId).neq("technician_status", "off_duty");
  if (error) console.error("Technician operational state update failed", { code: error.code, businessId, technicianId });
}

export async function assignDispatchJob(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  if (!hasRouteCapability(role,"reassign_jobs")) {
    console.warn("Route permission denied",{businessId:business.id,userId:user.id,operation:"reassign_jobs"});
    redirect(dispatchPath(slug, date, "error", "Permission denied."));
  }
  const technicianId = text(formData, "technicianId") || null;
  const routePlanId = text(formData, "routePlanId") || null;
  const planVersion = parseRoutePlanVersion(formData.get("planVersion"));
  const { data: job } = await supabase.from("jobs").select("id,status,starts_at,ends_at,arrival_window_start,arrival_window_end,assigned_technician_id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(dispatchPath(slug, date, "error", "Job not found."));
  if (technicianId) {
    const { data: technician } = await supabase.from("technician_profiles").select("id,technician_status").eq("id", technicianId).eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).maybeSingle();
    if (!technician) redirect(dispatchPath(slug, date, "error", "Technician is not assignable."));
    if (technician.technician_status === "off_duty") redirect(dispatchPath(slug, date, "error", "Technician is off duty."));
  }
  const startsAt = job.starts_at ? new Date(job.starts_at) : null;
  const endsAt = job.ends_at ? new Date(job.ends_at) : null;
  const conflict = await validateJobSchedule({
    supabase, businessId: business.id, timeZone: business.timezone,
    startsAt, endsAt,
    arrivalWindowStart: job.arrival_window_start ? new Date(job.arrival_window_start) : null,
    arrivalWindowEnd: job.arrival_window_end ? new Date(job.arrival_window_end) : null,
    technicianId, excludeJobId: jobId,
  });
  if (conflict) redirect(dispatchPath(slug, date, "error", conflict));
  const admin = getSupabaseAdmin();
  const affectedTechnicianIds = [...new Set([job.assigned_technician_id, technicianId].filter((value): value is string => Boolean(value)))];
  const routeMetrics = async (technician: string) => {
    if (!admin) return null;
    const { data } = await admin.from("technician_routes")
      .select("driving_distance_meters,driving_duration_seconds,technician_id,route_plans!inner(service_date)")
      .eq("business_id", business.id).eq("technician_id", technician).eq("route_plans.service_date", date).maybeSingle();
    const {data:profile}=data?.technician_id?await supabase.from("technician_directory").select("preferred_name").eq("business_id",business.id).eq("id",data.technician_id).maybeSingle():{data:null};
    return data ? {
      name: profile?.preferred_name ?? "Technician",
      metrics: {
        drivingDistanceMeters: data.driving_distance_meters,
        drivingDurationSeconds: data.driving_duration_seconds,
      } satisfies RoadMetrics,
    } : null;
  };
  const before = new Map(await Promise.all(affectedTechnicianIds.map(async (id) => [id, await routeMetrics(id)] as const)));
  const { error } = routePlanId && planVersion
    ? await supabase.rpc("reassign_dispatch_job_versioned", {
      p_business_id: business.id, p_route_plan_id: routePlanId, p_job_id: jobId,
      p_technician_id: technicianId, p_expected_plan_version: planVersion,
    })
    : await supabase.rpc("set_job_primary_technician", { p_job_id: jobId, p_technician_id: technicianId });
  if (error) {
    console.error("Dispatch assignment failed", { code: error.code, message: error.message, businessId: business.id, jobId });
    redirect(dispatchPath(slug, date, "error", isRouteEditConflict(error) ? ROUTE_EDIT_CONFLICT_MESSAGE : "Assignment could not be updated."));
  }
  if (job.assigned_technician_id && job.assigned_technician_id !== technicianId) {
    await supabase.from("technician_profiles").update({ technician_status: "available" }).eq("id", job.assigned_technician_id).eq("business_id", business.id).neq("technician_status", "off_duty");
  }
  if (technicianId) {
    await supabase.from("technician_profiles").update({ technician_status: "assigned" }).eq("id", technicianId).eq("business_id", business.id).neq("technician_status", "off_duty");
  }
  if (technicianId && technicianId !== job.assigned_technician_id) await JobNotificationService.technicianAssigned(jobId);
  let recalculationMessage = " Impacted routes are marked stale.";
  if (admin && process.env.GOOGLE_ROUTES_API_KEY && affectedTechnicianIds.length) {
    try {
      for (const affectedTechnicianId of affectedTechnicianIds) {
        await calculateDailyRoutes({
          admin, businessId: business.id, serviceDate: date, businessTimeZone: business.timezone,
          actorUserId: user.id, onlyTechnicianId: affectedTechnicianId,
        });
      }
      const after = new Map(await Promise.all(affectedTechnicianIds.map(async (id) => [id, await routeMetrics(id)] as const)));
      const comparable = affectedTechnicianIds.flatMap((id) => {
        const oldRoute = before.get(id), newRoute = after.get(id);
        return oldRoute && newRoute ? [{
          technicianName: newRoute.name,
          before: oldRoute.metrics,
          after: newRoute.metrics,
        }] : [];
      });
      const impact = comparable.length === affectedTechnicianIds.length ? actualRouteImpactSummary(comparable) : null;
      recalculationMessage = impact ? ` Actual road impact: ${impact}` : " Impacted routes were recalculated; comparable before-and-after road metrics were not available.";
    } catch (routeError) {
      console.error("Assignment route recalculation failed", {
        businessId: business.id, jobId, affectedTechnicianIds,
        reason: routeError instanceof Error ? routeError.message : String(routeError),
      });
      recalculationMessage = " Assignment saved, but one or more impacted routes still need recalculation.";
    }
  }
  revalidatePath(`/app/${slug}/dispatch`); revalidatePath(`/app/${slug}/schedule`); revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(dispatchPath(slug, date, "success", `${technicianId ? "Job assigned." : "Job moved to unassigned."}${recalculationMessage}`));
}

export async function updateDispatchStatus(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  if (!canManageCustomers(role)) redirect(dispatchPath(slug, date, "error", "Permission denied."));
  const requested = text(formData, "status") as JobStatus;
  const { data: job } = await supabase.from("jobs").select("id,status,assigned_technician_id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(dispatchPath(slug, date, "error", "Job not found."));
  const current = job.status as JobStatus;
  if (!availableJobTransitions(current).includes(requested) || !canTransitionJob(current, requested)) {
    redirect(dispatchPath(slug, date, "error", `Cannot change ${current.replaceAll("_", " ")} to ${requested.replaceAll("_", " ")}.`));
  }
  if (requested === "dispatched" && !job.assigned_technician_id) {
    redirect(dispatchPath(slug, date, "error", "Assign a technician before dispatching."));
  }
  const now = new Date().toISOString();
  const timestamps = requested === "arrived" ? { actual_arrival_at: now }
    : requested === "in_progress" ? { work_started_at: now }
      : requested === "completed" ? { work_completed_at: now } : {};
  const { error } = await supabase.from("jobs").update({ status: requested, ...timestamps, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false);
  if (error) {
    console.error("Dispatch status update failed", { code: error.code, businessId: business.id, jobId });
    redirect(dispatchPath(slug, date, "error", "Job status could not be updated."));
  }
  await updateTechnicianOperationalState(supabase, business.id, job.assigned_technician_id, requested);
  if (requested === "en_route") await JobNotificationService.technicianEnRoute(jobId);
  if (requested === "completed") {
    await Promise.allSettled([
      JobNotificationService.jobCompleted(jobId),
      JobNotificationService.reviewRequest(jobId),
    ]);
  }
  revalidatePath(`/app/${slug}/dispatch`); revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(dispatchPath(slug, date, "success", "Job status updated."));
}
