import { addDays } from "./bookingTime.ts";

export function startOfCalendarWeek(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export function calendarDays(date: string, view: "day" | "week") {
  const first = view === "week" ? startOfCalendarWeek(date) : date;
  return Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => addDays(first, index));
}

export function minutesInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part("hour") * 60 + part("minute");
}

export function calendarPlacement(start: string, end: string | null, timeZone: string, startHour: number, endHour: number) {
  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const startMinutes = Math.max(rangeStart, Math.min(rangeEnd, minutesInTimeZone(start, timeZone)));
  const fallbackEnd = startMinutes + 60;
  const endMinutes = end ? minutesInTimeZone(end, timeZone) : fallbackEnd;
  return {
    top: Math.max(0, startMinutes - rangeStart),
    height: Math.max(30, Math.min(rangeEnd, Math.max(startMinutes + 15, endMinutes)) - startMinutes),
  };
}
