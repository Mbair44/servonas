import type { jobStatuses } from "@/lib/jobValidation";

export type JobStatus = typeof jobStatuses[number];

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["pending", "confirmed", "scheduled", "canceled", "declined"],
  pending: ["confirmed", "scheduled", "canceled", "declined"],
  confirmed: ["scheduled", "dispatched", "canceled"],
  scheduled: ["dispatched", "canceled"],
  dispatched: ["scheduled", "en_route", "canceled"],
  en_route: ["dispatched", "arrived", "canceled"],
  arrived: ["in_progress", "canceled"],
  in_progress: ["completed", "canceled"],
  completed: [],
  canceled: [],
  declined: [],
};

export function availableJobTransitions(status: JobStatus) {
  return transitions[status] ?? [];
}

export function canTransitionJob(from: JobStatus, to: JobStatus) {
  return from === to || availableJobTransitions(from).includes(to);
}
