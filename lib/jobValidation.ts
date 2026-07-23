export const jobStatuses = [
  "draft", "pending", "confirmed", "scheduled", "dispatched", "en_route",
  "arrived", "in_progress", "completed", "canceled", "declined",
] as const;
export const jobPriorities = ["low", "normal", "high", "urgent"] as const;
export const paymentStatuses = ["unpaid", "pending", "partially_paid", "paid", "refunded", "void"] as const;

export const nonNegativeMoney = (value: string) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

export function validateJobTimes(start: Date | null, end: Date | null, arrivalStart: Date | null, arrivalEnd: Date | null) {
  if ((start && !end) || (!start && end)) return "Scheduled start and end are both required.";
  if (start && end && end <= start) return "Scheduled end must be after the start.";
  if ((arrivalStart && !arrivalEnd) || (!arrivalStart && arrivalEnd)) return "Both arrival-window times are required.";
  if (arrivalStart && arrivalEnd && arrivalEnd < arrivalStart) return "Arrival-window end must be after its start.";
  return null;
}
