import { addDays, dateInTimeZone, weekdayForDate, zonedDateTimeToUtc } from "@/lib/bookingTime";

type SupabaseAdmin = NonNullable<ReturnType<typeof import("@/lib/supabaseAdmin").getSupabaseAdmin>>;

export type AvailabilitySettings = {
  business_id: string;
  timezone: string;
  minimum_notice_hours: number;
  maximum_days_ahead: number;
  buffer_minutes: number;
  daily_appointment_limit: number | null;
};

export type AvailabilityService = { id: string; duration_minutes: number };
type Hours = { weekday: number; start_time: string; end_time: string };
type BusyWindow = { starts_at: string; ends_at: string };

function toMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function timeValue(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function overlaps(start: number, end: number, window: BusyWindow) {
  return start < new Date(window.ends_at).getTime() && end > new Date(window.starts_at).getTime();
}

export async function getAvailability(
  supabase: SupabaseAdmin,
  settings: AvailabilitySettings,
  service: AvailabilityService,
  startDate: string,
  endDate: string,
) {
  const queryStart = zonedDateTimeToUtc(startDate, "00:00", settings.timezone);
  const queryEnd = zonedDateTimeToUtc(addDays(endDate, 1), "00:00", settings.timezone);
  const [{ data: hours }, { data: jobs }, { data: blackouts }] = await Promise.all([
    supabase
      .from("booking_availability")
      .select("weekday,start_time,end_time")
      .eq("business_id", settings.business_id)
      .eq("active", true),
    supabase
      .from("jobs")
      .select("starts_at,ends_at")
      .eq("business_id", settings.business_id)
      .eq("is_deleted", false)
      .not("status", "eq", "canceled")
      .lt("starts_at", queryEnd.toISOString())
      .gt("ends_at", queryStart.toISOString()),
    supabase
      .from("booking_blackouts")
      .select("starts_at,ends_at")
      .eq("business_id", settings.business_id)
      .lt("starts_at", queryEnd.toISOString())
      .gt("ends_at", queryStart.toISOString()),
  ]);

  const result: Record<string, string[]> = {};
  const now = Date.now();
  const today = dateInTimeZone(new Date(), settings.timezone);
  const firstBookable = now + Number(settings.minimum_notice_hours || 0) * 3_600_000;
  const lastBookable = now + Number(settings.maximum_days_ahead || 60) * 86_400_000;
  const duration = Number(service.duration_minutes);
  const buffer = Number(settings.buffer_minutes || 0);
  const jobWindows = (jobs ?? []) as BusyWindow[];
  const blackoutWindows = (blackouts ?? []) as BusyWindow[];
  const schedule = (hours ?? []) as Hours[];

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    if (date < today) {
      result[date] = [];
      continue;
    }
    const dayHours = schedule.filter((row) => row.weekday === weekdayForDate(date));
    const dailyJobs = jobWindows.filter(
      (job) => dateInTimeZone(new Date(job.starts_at), settings.timezone) === date,
    );
    if (
      settings.daily_appointment_limit &&
      dailyJobs.length >= settings.daily_appointment_limit
    ) {
      result[date] = [];
      continue;
    }

    const slots: string[] = [];
    for (const opening of dayHours) {
      const startMinute = toMinutes(opening.start_time);
      const endMinute = toMinutes(opening.end_time);
      // The interval remains configurable in one place while duration and
      // conflicts determine availability; it is not a blind list of increments.
      for (let slot = Math.ceil(startMinute / 30) * 30; slot + duration <= endMinute; slot += 30) {
        const value = timeValue(slot);
        const startsAt = zonedDateTimeToUtc(date, value, settings.timezone).getTime();
        const serviceEndsAt = startsAt + duration * 60_000;
        const conflictEndsAt = serviceEndsAt + buffer * 60_000;
        if (startsAt < firstBookable || startsAt > lastBookable) continue;
        if (jobWindows.some((job) => overlaps(startsAt, conflictEndsAt, job))) continue;
        if (blackoutWindows.some((blackout) => overlaps(startsAt, conflictEndsAt, blackout))) continue;
        slots.push(value);
      }
    }
    result[date] = [...new Set(slots)];
  }
  return result;
}
