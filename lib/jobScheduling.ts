import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { conflictingJobNumbers, effectiveJobWindow, intervalsOverlap, technicianWorksDuring, type ScheduleWindow, type WorkingHours } from "@/lib/schedulingRules";

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/workspace").requireWorkspace>>["supabase"];

export type ScheduleCheck = {
  available: boolean;
  code?: "INVALID_RANGE" | "BOOKING_LIMIT" | "BUSINESS_CLOSED" | "BLACKOUT" | "TECHNICIAN_HOURS" | "TIME_OFF" | "JOB_CONFLICT" | "VERIFICATION_FAILED";
  message?: string;
};

export async function checkJobSchedule({
  supabase, businessId, timeZone, startsAt, endsAt, arrivalWindowStart,
  arrivalWindowEnd, technicianId, excludeJobId,
}: {
  supabase: SupabaseClient;
  businessId: string;
  timeZone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  arrivalWindowStart?: Date | null;
  arrivalWindowEnd?: Date | null;
  technicianId?: string | null;
  excludeJobId?: string;
}): Promise<ScheduleCheck> {
  if (!startsAt && !endsAt) return { available: true };
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return { available: false, code: "INVALID_RANGE", message: "Enter a valid scheduled start and end." };
  }

  const candidate = effectiveJobWindow({
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    arrival_window_start: arrivalWindowStart?.toISOString() ?? null,
    arrival_window_end: arrivalWindowEnd?.toISOString() ?? null,
  })!;
  const candidateStart = new Date(candidate.starts_at);
  const candidateEnd = new Date(candidate.ends_at);
  const date = dateInTimeZone(candidateStart, timeZone);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const startTime = timeFormatter.format(candidateStart);
  const endTime = timeFormatter.format(candidateEnd);

  const [hoursResult, blackoutResult, settingsResult, technicianResult, timeOffResult] = await Promise.all([
    supabase.from("booking_availability").select("id").eq("business_id", businessId).eq("weekday", weekday)
      .eq("active", true).lte("start_time", startTime).gte("end_time", endTime).limit(1),
    supabase.from("booking_blackouts").select("starts_at,ends_at").eq("business_id", businessId)
      .lt("starts_at", candidateEnd.toISOString()).gt("ends_at", candidateStart.toISOString()),
    supabase.from("booking_settings").select("minimum_notice_hours,maximum_days_ahead").eq("business_id", businessId).maybeSingle(),
    technicianId
      ? supabase.from("technician_profiles").select("default_working_hours,technician_status,employee_id").eq("id", technicianId).eq("business_id", businessId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    technicianId
      ? supabase.from("technician_time_off").select("starts_at,ends_at").eq("business_id", businessId).eq("technician_id", technicianId)
        .lt("starts_at", candidateEnd.toISOString()).gt("ends_at", candidateStart.toISOString())
      : Promise.resolve({ data: [] as ScheduleWindow[], error: null }),
  ]);

  if (hoursResult.error || blackoutResult.error || settingsResult.error || technicianResult.error || timeOffResult.error) {
    console.error("Schedule rule lookup failed", {
      businessId,
      hoursCode: hoursResult.error?.code,
      blackoutCode: blackoutResult.error?.code,
      settingsCode: settingsResult.error?.code,
      technicianCode: technicianResult.error?.code,
      timeOffCode: timeOffResult.error?.code,
    });
    return { available: false, code: "VERIFICATION_FAILED", message: "Scheduling rules could not be verified." };
  }
  if (!hoursResult.data?.length) {
    return { available: false, code: "BUSINESS_CLOSED", message: "The business is closed during that time." };
  }
  if ((blackoutResult.data as ScheduleWindow[] | null)?.some((window) => intervalsOverlap(candidateStart, candidateEnd, window))) {
    return { available: false, code: "BLACKOUT", message: "The job overlaps a business blackout period." };
  }

  const settings = settingsResult.data;
  if (settings) {
    const now = Date.now();
    if (candidateStart.getTime() < now + Number(settings.minimum_notice_hours ?? 0) * 3_600_000) {
      return { available: false, code: "BOOKING_LIMIT", message: "The requested time does not meet the minimum scheduling notice." };
    }
    if (candidateStart.getTime() > now + Number(settings.maximum_days_ahead ?? 365) * 86_400_000) {
      return { available: false, code: "BOOKING_LIMIT", message: "The requested time exceeds the maximum scheduling window." };
    }
  }

  if (!technicianId) return { available: true };
  if (!technicianResult.data || technicianResult.data.technician_status === "off_duty") {
    return { available: false, code: "TECHNICIAN_HOURS", message: "The technician is not available for assignment." };
  }
  const employeeId=technicianResult.data.employee_id;
  const employeeProfileResult=employeeId
    ?await supabase.from("employee_availability_profiles").select("time_zone,weekly_schedule_configured,maximum_daily_jobs,maximum_daily_minutes")
      .eq("business_id",businessId).eq("employee_id",employeeId).maybeSingle()
    :{data:null,error:null};
  if(employeeProfileResult.error){
    console.error("Employee availability profile lookup failed",{businessId,employeeId,code:employeeProfileResult.error.code});
    return {available:false,code:"VERIFICATION_FAILED",message:"Employee availability could not be verified."};
  }
  const employeeTimeZone=employeeProfileResult.data?.time_zone??timeZone;
  const employeeDate=dateInTimeZone(candidateStart,employeeTimeZone);
  const employeeWeekday=new Date(`${employeeDate}T12:00:00Z`).getUTCDay();
  const employeeTimeFormatter=new Intl.DateTimeFormat("en-GB",{
    timeZone:employeeTimeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  });
  const employeeStartTime=employeeTimeFormatter.format(candidateStart);
  const employeeEndTime=employeeTimeFormatter.format(candidateEnd);
  const dayStart=zonedDateTimeToUtc(employeeDate,"00:00",employeeTimeZone);
  const dayEnd=zonedDateTimeToUtc(addDays(employeeDate,1),"00:00",employeeTimeZone);
  const [employeeIntervalsResult,employeeExceptionsResult,dayJobsResult]=employeeId?await Promise.all([
    supabase.from("employee_weekly_intervals").select("interval_type,starts_at,ends_at")
      .eq("business_id",businessId).eq("employee_id",employeeId).eq("weekday",employeeWeekday),
    supabase.from("employee_availability_exceptions").select("starts_at,ends_at,availability_effect")
      .eq("business_id",businessId).eq("employee_id",employeeId).eq("approval_status","approved")
      .lt("starts_at",candidateEnd.toISOString()).gt("ends_at",candidateStart.toISOString()),
    supabase.from("jobs").select("id,starts_at,ends_at").eq("business_id",businessId)
      .eq("assigned_technician_id",technicianId).eq("is_deleted",false)
      .not("status","in",'("canceled","declined")').gte("starts_at",dayStart.toISOString()).lt("starts_at",dayEnd.toISOString()),
  ]):[
    {data:[],error:null},{data:[],error:null},{data:[],error:null},
  ];
  if(employeeIntervalsResult.error||employeeExceptionsResult.error||dayJobsResult.error){
    console.error("Employee availability lookup failed",{
      businessId,employeeId,
      intervalCode:employeeIntervalsResult.error?.code,
      exceptionCode:employeeExceptionsResult.error?.code,capacityCode:dayJobsResult.error?.code,
    });
    return {available:false,code:"VERIFICATION_FAILED",message:"Employee availability could not be verified."};
  }
  const approvedExceptions=(employeeExceptionsResult.data??[]) as Array<ScheduleWindow&{availability_effect:string}>;
  const availableOverride=approvedExceptions.some(item=>item.availability_effect==="available"&&new Date(item.starts_at)<=candidateStart&&new Date(item.ends_at)>=candidateEnd);
  if(approvedExceptions.some(item=>item.availability_effect==="unavailable"&&intervalsOverlap(candidateStart,candidateEnd,item))){
    return {available:false,code:"TIME_OFF",message:"The employee is unavailable during that time."};
  }
  const employeeIntervals=(employeeIntervalsResult.data??[]) as Array<{interval_type:string;starts_at:string;ends_at:string}>;
  const structuredHours=employeeProfileResult.data?.weekly_schedule_configured===true;
  const withinWork=employeeIntervals.some(item=>item.interval_type==="working"&&item.starts_at.slice(0,5)<=employeeStartTime&&item.ends_at.slice(0,5)>=employeeEndTime);
  const overlapsBreak=employeeIntervals.some(item=>item.interval_type==="break"&&item.starts_at.slice(0,5)<employeeEndTime&&item.ends_at.slice(0,5)>employeeStartTime);
  if(!availableOverride&&structuredHours&&(!withinWork||overlapsBreak)){
    return {available:false,code:"TECHNICIAN_HOURS",message:overlapsBreak?"The job overlaps the employee’s recurring break.":"The job falls outside the employee’s working hours."};
  }
  if (!structuredHours&&!technicianWorksDuring(technicianResult.data.default_working_hours as WorkingHours, weekday, startTime, endTime)) {
    return { available: false, code: "TECHNICIAN_HOURS", message: "The job falls outside the technician’s working hours." };
  }
  if ((timeOffResult.data as ScheduleWindow[] | null)?.some((window) => intervalsOverlap(candidateStart, candidateEnd, window))) {
    return { available: false, code: "TIME_OFF", message: "The technician has approved time off during that time." };
  }
  const capacity=employeeProfileResult.data;
  const scheduledJobs=(dayJobsResult.data??[]).filter(item=>item.id!==excludeJobId);
  if(capacity?.maximum_daily_jobs&&scheduledJobs.length>=capacity.maximum_daily_jobs){
    return {available:false,code:"TECHNICIAN_HOURS",message:"The employee has reached their maximum daily job capacity."};
  }
  const scheduledMinutes=scheduledJobs.reduce((total,item)=>{
    if(!item.starts_at||!item.ends_at)return total;
    return total+Math.max(0,(new Date(item.ends_at).getTime()-new Date(item.starts_at).getTime())/60000);
  },0);
  const candidateMinutes=(candidateEnd.getTime()-candidateStart.getTime())/60000;
  if(capacity?.maximum_daily_minutes&&scheduledMinutes+candidateMinutes>capacity.maximum_daily_minutes){
    return {available:false,code:"TECHNICIAN_HOURS",message:"The job exceeds the employee’s maximum daily hours."};
  }

  let query = supabase.from("jobs")
    .select("job_number,starts_at,ends_at,arrival_window_start,arrival_window_end")
    .eq("business_id", businessId).eq("assigned_technician_id", technicianId)
    .eq("is_deleted", false).not("status", "in", '("canceled","declined")')
    .or(`and(starts_at.lt.${candidateEnd.toISOString()},ends_at.gt.${candidateStart.toISOString()}),and(arrival_window_start.lt.${candidateEnd.toISOString()},arrival_window_end.gt.${candidateStart.toISOString()})`);
  if (excludeJobId) query = query.neq("id", excludeJobId);
  const { data: jobs, error: jobsError } = await query;
  if (jobsError) {
    console.error("Technician conflict lookup failed", { code: jobsError.code, businessId, excludeJobId });
    return { available: false, code: "VERIFICATION_FAILED", message: "Technician availability could not be verified." };
  }
  const conflicts = conflictingJobNumbers(candidateStart, candidateEnd, jobs ?? []);
  if (conflicts.length) {
    return { available: false, code: "JOB_CONFLICT", message: `Technician conflict with job #${conflicts[0]}.` };
  }
  return { available: true };
}

export async function validateJobSchedule(args: Parameters<typeof checkJobSchedule>[0]) {
  const result = await checkJobSchedule(args);
  return result.available ? null : result.message ?? "The requested schedule is unavailable.";
}
