import { dateInTimeZone } from "@/lib/bookingTime";

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/workspace").requireWorkspace>>["supabase"];

export async function validateJobSchedule({
  supabase,
  businessId,
  timeZone,
  startsAt,
  endsAt,
  technicianId,
  excludeJobId,
}: {
  supabase: SupabaseClient;
  businessId: string;
  timeZone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  technicianId?: string | null;
  excludeJobId?: string;
}) {
  if (!startsAt || !endsAt) return null;
  const date = dateInTimeZone(startsAt, timeZone);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const startTime = timeFormatter.format(startsAt);
  const endTime = timeFormatter.format(endsAt);
  const [{ data: hours, error: hoursError }, { data: blackouts, error: blackoutError }] = await Promise.all([
    supabase.from("booking_availability").select("id").eq("business_id", businessId).eq("weekday", weekday)
      .eq("active", true).lte("start_time", startTime).gte("end_time", endTime).limit(1),
    supabase.from("booking_blackouts").select("id").eq("business_id", businessId)
      .lt("starts_at", endsAt.toISOString()).gt("ends_at", startsAt.toISOString()).limit(1),
  ]);
  if (hoursError || blackoutError) return "Scheduling rules could not be verified.";
  if (!hours?.length) return "The job falls outside business working hours.";
  if (blackouts?.length) return "The job overlaps a business blackout period.";
  if (!technicianId) return null;

  let query = supabase.from("jobs").select("id,job_number,title").eq("business_id", businessId)
    .eq("assigned_technician_id", technicianId).eq("is_deleted", false).neq("status", "canceled")
    .lt("starts_at", endsAt.toISOString()).gt("ends_at", startsAt.toISOString()).limit(1);
  if (excludeJobId) query = query.neq("id", excludeJobId);
  const { data: conflicts, error } = await query;
  if (error) return "Technician availability could not be verified.";
  if (conflicts?.length) return `Technician conflict with job #${conflicts[0].job_number}.`;
  return null;
}
