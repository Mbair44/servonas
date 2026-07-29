import type {SupabaseClient} from "@supabase/supabase-js";
import {dateInTimeZone} from "@/lib/bookingTime";
import {calculateDailyRoutes} from "./routeCalculationService";
import {generateRouteOptimizationSuggestions} from "./optimizationService";

type ScheduledJob={
 id:string;
 starts_at:string|null;
 assigned_technician_id:string|null;
};

export type AutomaticRouteRefreshResult={
 refreshedDays:number;
 optimizedDays:number;
 skippedDays:number;
 failures:number;
};

/**
 * Rebuilds each affected technician's complete service day, then repeatedly
 * applies the existing road-based, appointment-window-safe adjacent optimizer
 * until no further improvement is found (or the safety round limit is reached).
 *
 * The authenticated client applies suggestions so the existing tenant/role
 * authorization and decision audit remain authoritative. The service-role
 * client is restricted to provider orchestration and route persistence.
 */
export async function refreshAffectedTechnicianRoutes({
 admin,
 authenticated,
 businessId,
 businessTimeZone,
 actorUserId,
 jobs,
}:{
 admin:SupabaseClient;
 authenticated:SupabaseClient;
 businessId:string;
 businessTimeZone:string;
 actorUserId:string;
 jobs:ScheduledJob[];
}):Promise<AutomaticRouteRefreshResult>{
 const result:AutomaticRouteRefreshResult={refreshedDays:0,optimizedDays:0,skippedDays:0,failures:0};
 if(!process.env.GOOGLE_ROUTES_API_KEY)return {...result,skippedDays:jobs.length?1:0};

 const affected=[...new Map(jobs.flatMap(job=>{
  if(!job.starts_at||!job.assigned_technician_id)return [];
  const serviceDate=dateInTimeZone(new Date(job.starts_at),businessTimeZone);
  return [[`${serviceDate}:${job.assigned_technician_id}`,{serviceDate,technicianId:job.assigned_technician_id}]] as const;
 })).values()];
 const maxDays=Math.max(1,Number(process.env.AUTO_ROUTE_REFRESH_MAX_DAYS??20));
 const maxRounds=Math.max(1,Math.min(12,Number(process.env.AUTO_ROUTE_OPTIMIZATION_ROUNDS??6)));

 for(const affectedDay of affected.slice(0,maxDays)){
  try{
   await calculateDailyRoutes({
    admin,businessId,serviceDate:affectedDay.serviceDate,businessTimeZone,
    actorUserId,onlyTechnicianId:affectedDay.technicianId,
   });
   result.refreshedDays+=1;
   let dayOptimized=false;
   for(let round=0;round<maxRounds;round+=1){
    const {data:plan}=await admin.from("route_plans")
     .select("id,version").eq("business_id",businessId)
     .eq("service_date",affectedDay.serviceDate).maybeSingle();
    if(!plan)break;
    const suggestionRun=await generateRouteOptimizationSuggestions({
     admin,businessId,routePlanId:plan.id,actorUserId,expectedPlanVersion:Number(plan.version),
    });
    if(!suggestionRun.suggestions)break;
    const {data:suggestions}=await authenticated.from("route_suggestions")
     .select("id,payload").eq("business_id",businessId).eq("route_plan_id",plan.id)
     .eq("status","pending").order("created_at",{ascending:false});
    const suggestion=(suggestions??[]).find(item=>{
     const payload=item.payload as Record<string,unknown>|null;
     return String(payload?.technicianId??"")===affectedDay.technicianId;
    });
    if(!suggestion)break;
    const {error:decisionError}=await authenticated.rpc("decide_route_suggestion",{
     p_business_id:businessId,p_suggestion_id:suggestion.id,
     p_decision:"accepted",p_expected_plan_version:Number(plan.version),
    });
    if(decisionError)throw new Error(`Automatic route suggestion could not be applied (${decisionError.code}).`);
    dayOptimized=true;
    await calculateDailyRoutes({
     admin,businessId,serviceDate:affectedDay.serviceDate,businessTimeZone,
     actorUserId,onlyTechnicianId:affectedDay.technicianId,
    });
   }
   if(dayOptimized)result.optimizedDays+=1;
  }catch(error){
   result.failures+=1;
   console.error("Automatic recurring route refresh failed",{
    businessId,serviceDate:affectedDay.serviceDate,technicianId:affectedDay.technicianId,
    reason:error instanceof Error?error.message:String(error),
   });
  }
 }
 result.skippedDays=Math.max(0,affected.length-maxDays);
 if(result.skippedDays){
  console.warn("Automatic recurring route refresh safety limit reached",{
   businessId,affectedDays:affected.length,processedDays:maxDays,skippedDays:result.skippedDays,
  });
 }
 return result;
}
