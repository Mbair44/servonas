type TimedJob = { id: string; starts_at: string | null; ends_at: string | null; assigned_technician_id: string | null };

export function conflictingDispatchJobIds(jobs: TimedJob[]) {
  const conflicts = new Set<string>();
  const byTechnician = new Map<string, TimedJob[]>();
  for (const job of jobs) {
    if (!job.assigned_technician_id || !job.starts_at || !job.ends_at) continue;
    const group = byTechnician.get(job.assigned_technician_id) ?? [];
    group.push(job);
    byTechnician.set(job.assigned_technician_id, group);
  }
  for (const group of byTechnician.values()) {
    const ordered = group.sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime());
    for (let left = 0; left < ordered.length; left += 1) {
      for (let right = left + 1; right < ordered.length; right += 1) {
        if (new Date(ordered[right].starts_at!).getTime() >= new Date(ordered[left].ends_at!).getTime()) break;
        conflicts.add(ordered[left].id);
        conflicts.add(ordered[right].id);
      }
    }
  }
  return conflicts;
}

export function dispatchTechnicianState(
  configured: string,
  statuses: string[],
): "available" | "assigned" | "en_route" | "on_site" | "completed" | "off_duty" {
  if (configured === "off_duty") return "off_duty";
  if (statuses.some((status) => status === "arrived" || status === "in_progress")) return "on_site";
  if (statuses.includes("en_route")) return "en_route";
  if (statuses.some((status) => !["completed", "canceled", "declined"].includes(status))) return "assigned";
  if (statuses.includes("completed")) return "completed";
  return "available";
}
