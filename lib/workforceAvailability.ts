export type WeeklyIntervalInput = {
  weekday: number;
  interval_type: "working" | "break";
  starts_at: string;
  ends_at: string;
};

export function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateAvailabilityProfile(input: {
  timeZone: string;
  maximumDailyJobs: number | null;
  maximumDailyMinutes: number | null;
  overtimePreference: string;
}) {
  if (!validTimeZone(input.timeZone)) return "Choose a valid IANA time zone.";
  if (input.maximumDailyJobs !== null
    && (!Number.isInteger(input.maximumDailyJobs) || input.maximumDailyJobs < 1 || input.maximumDailyJobs > 100)) {
    return "Maximum daily jobs must be between 1 and 100.";
  }
  if (input.maximumDailyMinutes !== null
    && (!Number.isInteger(input.maximumDailyMinutes) || input.maximumDailyMinutes < 30 || input.maximumDailyMinutes > 1440)) {
    return "Maximum daily hours must be between 0.5 and 24.";
  }
  if (!["avoid", "ask", "allowed", "preferred"].includes(input.overtimePreference)) {
    return "Choose a valid overtime preference.";
  }
  return null;
}

export function validateWeeklyIntervals(intervals: WeeklyIntervalInput[]) {
  for (const interval of intervals) {
    if (!Number.isInteger(interval.weekday) || interval.weekday < 0 || interval.weekday > 6) {
      return "Weekly schedule contains an invalid day.";
    }
    if (!/^\d{2}:\d{2}$/.test(interval.starts_at) || !/^\d{2}:\d{2}$/.test(interval.ends_at)
      || interval.ends_at <= interval.starts_at) {
      return "Every schedule interval must have a start before its end.";
    }
    if (interval.interval_type === "break") {
      const work = intervals.find((candidate) =>
        candidate.weekday === interval.weekday
        && candidate.interval_type === "working"
        && candidate.starts_at <= interval.starts_at
        && candidate.ends_at >= interval.ends_at);
      if (!work) return "Every recurring break must fall within that day’s working hours.";
    }
  }
  return null;
}
