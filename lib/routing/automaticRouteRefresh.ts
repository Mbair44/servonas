import type {SupabaseClient} from "@supabase/supabase-js";
import {dateInTimeZone} from "@/lib/bookingTime";
import {calculateDailyRoutes} from "./routeCalculationService";
import {generateRouteOptimizationSuggestions} from "./optimizationService";
import {GoogleRoutesProvider} from "./googleRoutesProvider";
import {shortestFlexibleRoute} from "./flexibleRouteOrder";

type ScheduledJob={
 id:string;
 starts_at:string|null;
 assigned_technician_id:string|null;
};

const safeRouteFailureCode=(error:unknown)=>{
 const message=error instanceof Error?error.message:String(error);
 if(/timeout|timed out|abort/i.test(message))return "provider_timeout";
 const googleStatus=message.match(/Google Routes request failed \((\d{3})\)/i)?.[1];
 if(googleStatus)return `google_http_${googleStatus}`;
 const databaseCode=message.match(/\(([0-9A-Z]{5}|PGRST\d+)\)/i)?.[1];
 if(databaseCode)return `database_${databaseCode.toLowerCase()}`;
 return "automatic_route_refresh_failed";
};

export type AutomaticRouteRefreshResult={
 refreshedDays:number;
 optimizedDays:number;
 skippedDays:number;
 failures:number;
};

async function normalizeFlexibleJobs({
 admin,businessId,serviceDate,businessTimeZone,technicianId,actorUserId,
}:{
 admin:SupabaseClient;businessId:string;serviceDate:string;businessTimeZone:string;
 technicianId:string;actorUserId:string;
}){
 const dayStart=new Date(`${serviceDate}T00:00:00.000Z`);
 const nextDay=new Date(dayStart);nextDay.setUTCDate(nextDay.getUTCDate()+1);
 // Query a broad UTC envelope, then use the business-local service date.
 const {data:jobs}=await admin.from("jobs")
  .select("id,starts_at,ends_at,estimated_duration_minutes,recurring_service_series_id,status,arrival_window_start,arrival_window_end")
  .eq("business_id",businessId).eq("assigned_technician_id",technicianId)
  .eq("is_deleted",false).not("status","in",'("completed","canceled","declined")')
  .gte("starts_at",new Date(dayStart.getTime()-14*60*60*1000).toISOString())
  .lt("starts_at",new Date(nextDay.getTime()+14*60*60*1000).toISOString()).order("starts_at");
 const dayJobs=(jobs??[]).filter(job=>job.starts_at&&dateInTimeZone(new Date(job.starts_at),businessTimeZone)===serviceDate);
 if(dayJobs.length<2)return;
 let cursor=Math.min(...dayJobs.map(job=>new Date(job.starts_at!).getTime()));
 for(const job of dayJobs){
  const originalStart=new Date(job.starts_at!).getTime();
  const originalEnd=job.ends_at?new Date(job.ends_at).getTime():NaN;
  const durationMs=Number.isFinite(originalEnd)&&originalEnd>originalStart
   ?originalEnd-originalStart:Math.max(1,Number(job.estimated_duration_minutes??60))*60_000;
  const flexible=job.recurring_service_series_id
   ||(job.status==="scheduled"&&!job.arrival_window_start&&!job.arrival_window_end);
  if(!flexible){
   cursor=Math.max(cursor,originalStart)+durationMs;
   continue;
  }
  const startsAt=new Date(cursor).toISOString(),endsAt=new Date(cursor+durationMs).toISOString();
  const {error}=await admin.from("jobs").update({starts_at:startsAt,ends_at:endsAt,updated_by:actorUserId})
   .eq("business_id",businessId).eq("id",job.id);
  if(error)throw new Error(`Flexible service time could not be normalized (${error.code}).`);
  cursor+=durationMs;
 }
}

async function applyCalculatedDriveSchedule({
 admin,businessId,serviceDate,technicianId,actorUserId,
}:{
 admin:SupabaseClient;businessId:string;serviceDate:string;technicianId:string;actorUserId:string;
}){
 const {data:plan}=await admin.from("route_plans").select("id")
  .eq("business_id",businessId).eq("service_date",serviceDate).maybeSingle();
 if(!plan)return;
 const {data:route}=await admin.from("technician_routes").select("id")
  .eq("business_id",businessId).eq("route_plan_id",plan.id)
  .eq("technician_id",technicianId).maybeSingle();
 if(!route)return;
 const [{data:stops},{data:legs}]=await Promise.all([
  admin.from("route_stops").select("id,job_id,sequence").eq("business_id",businessId)
   .eq("technician_route_id",route.id).order("sequence"),
  admin.from("route_legs").select("from_route_stop_id,to_route_stop_id,driving_duration_seconds,calculation_status")
   .eq("business_id",businessId).eq("technician_route_id",route.id).eq("calculation_status","ready"),
 ]);
 if(!stops?.length)return;
  const {data:jobs}=await admin.from("jobs")
  .select("id,starts_at,ends_at,estimated_duration_minutes,recurring_service_series_id,status,arrival_window_start,arrival_window_end")
  .eq("business_id",businessId).in("id",stops.map(stop=>stop.job_id));
 const jobById=new Map((jobs??[]).map(job=>[job.id,job]));
 const driveToStop=new Map((legs??[]).flatMap(leg=>leg.to_route_stop_id
  ?[[leg.to_route_stop_id,Number(leg.driving_duration_seconds??0)] as const]:[]));
 const firstJob=jobById.get(stops[0].job_id);
 if(!firstJob?.starts_at)return;
 let cursor=new Date(firstJob.starts_at).getTime();
 for(const [index,stop] of stops.entries()){
  const job=jobById.get(stop.job_id);
  if(!job?.starts_at)continue;
  if(index>0)cursor+=Math.max(0,driveToStop.get(stop.id)??0)*1000;
  const originalStart=new Date(job.starts_at).getTime();
  const originalEnd=job.ends_at?new Date(job.ends_at).getTime():NaN;
  const durationMs=Number.isFinite(originalEnd)&&originalEnd>originalStart
   ?originalEnd-originalStart:Math.max(1,Number(job.estimated_duration_minutes??60))*60_000;
  const flexible=job.recurring_service_series_id
   ||(job.status==="scheduled"&&!job.arrival_window_start&&!job.arrival_window_end);
  if(!flexible){
   cursor=Math.max(cursor,originalStart)+durationMs;
   continue;
  }
  const {error}=await admin.from("jobs").update({
   starts_at:new Date(cursor).toISOString(),ends_at:new Date(cursor+durationMs).toISOString(),updated_by:actorUserId,
  }).eq("business_id",businessId).eq("id",job.id);
  if(error)throw new Error(`Drive-aware service time could not be saved (${error.code}).`);
  cursor+=durationMs;
 }
}

async function globallyOptimizeFlexibleDay({
 admin,businessId,serviceDate,businessTimeZone,technicianId,actorUserId,
}:{
 admin:SupabaseClient;businessId:string;serviceDate:string;businessTimeZone:string;
 technicianId:string;actorUserId:string;
}){
 const dayStart=new Date(`${serviceDate}T00:00:00.000Z`);
 const nextDay=new Date(dayStart);nextDay.setUTCDate(nextDay.getUTCDate()+1);
 const {data:rows,error}=await admin.from("jobs")
  .select("id,starts_at,ends_at,estimated_duration_minutes,status,arrival_window_start,arrival_window_end,service_locations!jobs_service_location_tenant_fk(latitude,longitude,geocoding_status)")
  .eq("business_id",businessId).eq("assigned_technician_id",technicianId)
  .eq("is_deleted",false).not("status","in",'("completed","canceled","declined")')
  .gte("starts_at",new Date(dayStart.getTime()-14*60*60*1000).toISOString())
  .lt("starts_at",new Date(nextDay.getTime()+14*60*60*1000).toISOString());
 if(error)throw new Error(`Flexible route jobs could not be loaded (${error.code}).`);
 const jobs=(rows??[]).filter(job=>job.starts_at
  &&dateInTimeZone(new Date(job.starts_at),businessTimeZone)===serviceDate);
 if(jobs.length<3)return false;
 if(jobs.some(job=>!["pending","scheduled"].includes(job.status)
  ||job.arrival_window_start||job.arrival_window_end))return false;
 const normalized=jobs.flatMap(job=>{
  const relation=Array.isArray(job.service_locations)?job.service_locations[0]:job.service_locations;
  const latitude=Number(relation?.latitude),longitude=Number(relation?.longitude);
  if(!relation||!["verified","manual"].includes(relation.geocoding_status)
   ||!Number.isFinite(latitude)||!Number.isFinite(longitude))return [];
  const startsAt=new Date(job.starts_at!).getTime();
  const endsAt=job.ends_at?new Date(job.ends_at).getTime():NaN;
  const durationMs=Number.isFinite(endsAt)&&endsAt>startsAt
   ?endsAt-startsAt:Math.max(1,Number(job.estimated_duration_minutes??60))*60_000;
  return [{job,waypoint:{id:job.id,latitude,longitude},durationMs}];
 });
 if(normalized.length!==jobs.length)return false;
 const provider=new GoogleRoutesProvider(process.env.GOOGLE_ROUTES_API_KEY??"");
 const departureAt=new Date(Math.min(...normalized.map(item=>new Date(item.job.starts_at!).getTime()))).toISOString();
 const cells=await provider.computeRouteMatrix({
  origins:normalized.map(item=>item.waypoint),
  destinations:normalized.map(item=>item.waypoint),
  departureAt,
 });
 const orderedIds=shortestFlexibleRoute(normalized.map(item=>item.job.id),cells);
 if(!orderedIds)return false;
 const itemById=new Map(normalized.map(item=>[item.job.id,item]));
 const driveSeconds=new Map(cells.flatMap(cell=>cell.status==="ready"&&cell.drivingDurationSeconds!==null
  ?[[`${cell.originWaypointId}:${cell.destinationWaypointId}`,cell.drivingDurationSeconds] as const]:[]));
 let cursor=new Date(departureAt).getTime();
 for(const [index,jobId] of orderedIds.entries()){
  const item=itemById.get(jobId)!;
  const {error:updateError}=await admin.from("jobs").update({
   starts_at:new Date(cursor).toISOString(),
   ends_at:new Date(cursor+item.durationMs).toISOString(),
   updated_by:actorUserId,
  }).eq("business_id",businessId).eq("id",jobId);
  if(updateError)throw new Error(`Globally optimized service time could not be saved (${updateError.code}).`);
  cursor+=item.durationMs;
  const nextId=orderedIds[index+1];
  if(nextId)cursor+=Math.max(0,driveSeconds.get(`${jobId}:${nextId}`)??0)*1000;
 }
 return true;
}

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
 // Keep synchronous recalculation within the request lifecycle. Additional
 // optimization passes belong in queued orchestration; running dozens of
 // provider calls here can terminate the request and strand the route in
 // `calculating`.
 const maxRounds=Math.max(0,Math.min(3,Number(process.env.AUTO_ROUTE_OPTIMIZATION_ROUNDS??1)));

 for(const affectedDay of affected.slice(0,maxDays)){
  try{
   await normalizeFlexibleJobs({
    admin,businessId,serviceDate:affectedDay.serviceDate,businessTimeZone,
    technicianId:affectedDay.technicianId,actorUserId,
   });
   const globallyOptimized=await globallyOptimizeFlexibleDay({
    admin,businessId,serviceDate:affectedDay.serviceDate,businessTimeZone,
    technicianId:affectedDay.technicianId,actorUserId,
   });
   await calculateDailyRoutes({
    admin,businessId,serviceDate:affectedDay.serviceDate,businessTimeZone,
    actorUserId,onlyTechnicianId:affectedDay.technicianId,
   });
   result.refreshedDays+=1;
   let dayOptimized=globallyOptimized;
   try{
    for(let round=0;round<(globallyOptimized?0:maxRounds);round+=1){
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
   }catch(optimizationError){
    console.warn("Automatic route optimization skipped after base route calculation",{
     businessId,serviceDate:affectedDay.serviceDate,technicianId:affectedDay.technicianId,
     reason:optimizationError instanceof Error?optimizationError.message:String(optimizationError),
    });
   }
   await applyCalculatedDriveSchedule({
    admin,businessId,serviceDate:affectedDay.serviceDate,
    technicianId:affectedDay.technicianId,actorUserId,
   });
   await calculateDailyRoutes({
    admin,businessId,serviceDate:affectedDay.serviceDate,businessTimeZone,
    actorUserId,onlyTechnicianId:affectedDay.technicianId,
   });
   if(dayOptimized)result.optimizedDays+=1;
  }catch(error){
   result.failures+=1;
   const failureCode=safeRouteFailureCode(error);
   const {data:failedPlan}=await admin.from("route_plans").update({
    calculation_status:"failed",error_code:failureCode,
   }).eq("business_id",businessId).eq("service_date",affectedDay.serviceDate)
    .in("calculation_status",["queued","calculating"]).select("id").maybeSingle();
   if(failedPlan){
    await admin.from("technician_routes").update({
     calculation_status:"failed",error_code:failureCode,
    }).eq("business_id",businessId).eq("route_plan_id",failedPlan.id)
     .eq("technician_id",affectedDay.technicianId)
     .in("calculation_status",["queued","calculating"]);
   }
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
