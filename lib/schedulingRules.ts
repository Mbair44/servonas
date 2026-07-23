export type ScheduleWindow = { starts_at: string; ends_at: string };
export type WorkingHoursValue =
  | { active?: boolean; start?: string; end?: string; start_time?: string; end_time?: string }
  | Array<{ start?: string; end?: string; start_time?: string; end_time?: string }>;
export type WorkingHours = Record<string, WorkingHoursValue>;

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function intervalsOverlap(start: Date, end: Date, window: ScheduleWindow) {
  return start.getTime() < new Date(window.ends_at).getTime()
    && end.getTime() > new Date(window.starts_at).getTime();
}

export function effectiveJobWindow(job: {
  starts_at: string | null;
  ends_at: string | null;
  arrival_window_start?: string | null;
  arrival_window_end?: string | null;
}) {
  if (!job.starts_at || !job.ends_at) return null;
  const starts = [job.starts_at, job.arrival_window_start].filter(Boolean).map((value) => new Date(value!).getTime());
  const ends = [job.ends_at, job.arrival_window_end].filter(Boolean).map((value) => new Date(value!).getTime());
  return { starts_at: new Date(Math.min(...starts)).toISOString(), ends_at: new Date(Math.max(...ends)).toISOString() };
}

function normalizeWindows(value: WorkingHoursValue | undefined) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : value.active === false ? [] : [value];
  return values.flatMap((window) => {
    const start = window.start ?? window.start_time;
    const end = window.end ?? window.end_time;
    return start && end ? [{ start: start.slice(0, 5), end: end.slice(0, 5) }] : [];
  });
}

export function technicianWorksDuring(
  hours: WorkingHours | null | undefined,
  weekday: number,
  startTime: string,
  endTime: string,
) {
  if (!hours || Object.keys(hours).length === 0) return true;
  const value = hours[String(weekday)] ?? hours[dayNames[weekday]] ?? hours[dayNames[weekday].slice(0, 3)];
  return normalizeWindows(value).some((window) => window.start <= startTime && window.end >= endTime);
}

export function conflictingJobNumbers(
  candidateStart: Date,
  candidateEnd: Date,
  jobs: Array<{ job_number: string; starts_at: string | null; ends_at: string | null; arrival_window_start?: string | null; arrival_window_end?: string | null }>,
) {
  return jobs.filter((job) => {
    const window = effectiveJobWindow(job);
    return window ? intervalsOverlap(candidateStart, candidateEnd, window) : false;
  }).map((job) => job.job_number);
}
