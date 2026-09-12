import { addDays } from "./bookingTime.ts";

export function startOfCalendarWeek(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export type ScheduleView = "day" | "week" | "month";

function monthBoundary(date: string, offset: number, day: number) {
  const [year, month] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + offset, day));
  return value.toISOString().slice(0, 10);
}

export function shiftCalendarMonth(date: string, offset: number) {
  return monthBoundary(date, offset, 1);
}

export function calendarDays(date: string, view: ScheduleView) {
  if (view === "day") return [date];
  if (view === "week") {
    const first = startOfCalendarWeek(date);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }
  const first = startOfCalendarWeek(monthBoundary(date, 0, 1));
  const lastOfMonth = addDays(monthBoundary(date, 1, 1), -1);
  const last = addDays(startOfCalendarWeek(lastOfMonth), 6);
  const length = Math.round((new Date(`${last}T12:00:00Z`).getTime() - new Date(`${first}T12:00:00Z`).getTime()) / 86_400_000) + 1;
  return Array.from({ length }, (_, index) => addDays(first, index));
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
