import type { RouteMatrixCell } from "./domain";

/**
 * Finds the minimum-duration open route (no fixed depot/start/end) through all
 * supplied stops. Exact dynamic programming is intentionally bounded to small
 * field-service days; larger days fall back to a deterministic nearest-neighbor
 * route so provider orchestration remains predictable.
 */
export function shortestFlexibleRoute(
  waypointIds: string[],
  cells: RouteMatrixCell[],
): string[] | null {
  if (waypointIds.length < 2) return [...waypointIds];
  const duration = new Map(cells.flatMap((cell) =>
    cell.status === "ready" && cell.drivingDurationSeconds !== null
      ? [[`${cell.originWaypointId}:${cell.destinationWaypointId}`, cell.drivingDurationSeconds] as const]
      : [],
  ));
  const cost = (from: number, to: number) => duration.get(`${waypointIds[from]}:${waypointIds[to]}`);

  if (waypointIds.length <= 12) {
    const size = 1 << waypointIds.length;
    const best = Array.from({ length: size }, () => Array<number>(waypointIds.length).fill(Infinity));
    const previous = Array.from({ length: size }, () => Array<number>(waypointIds.length).fill(-1));
    for (let index = 0; index < waypointIds.length; index += 1) best[1 << index][index] = 0;
    for (let mask = 1; mask < size; mask += 1) {
      for (let last = 0; last < waypointIds.length; last += 1) {
        if (!Number.isFinite(best[mask][last])) continue;
        for (let next = 0; next < waypointIds.length; next += 1) {
          if (mask & (1 << next)) continue;
          const leg = cost(last, next);
          if (leg === undefined) continue;
          const nextMask = mask | (1 << next);
          const candidate = best[mask][last] + leg;
          if (candidate < best[nextMask][next]) {
            best[nextMask][next] = candidate;
            previous[nextMask][next] = last;
          }
        }
      }
    }
    const fullMask = size - 1;
    let last = best[fullMask].reduce(
      (winner, value, index, values) => value < values[winner] ? index : winner,
      0,
    );
    if (!Number.isFinite(best[fullMask][last])) return null;
    const ordered: string[] = [];
    let mask = fullMask;
    while (last >= 0) {
      ordered.push(waypointIds[last]);
      const prior = previous[mask][last];
      mask ^= 1 << last;
      last = prior;
    }
    return ordered.reverse();
  }

  // Deterministic fallback for unusually large days: test every possible first
  // stop and retain the best nearest-neighbor path.
  let winner: { ids: string[]; seconds: number } | null = null;
  for (let start = 0; start < waypointIds.length; start += 1) {
    const remaining = new Set(waypointIds.map((_, index) => index));
    remaining.delete(start);
    const indices = [start];
    let seconds = 0;
    while (remaining.size) {
      const current = indices.at(-1)!;
      const next = [...remaining].sort((left, right) =>
        (cost(current, left) ?? Infinity) - (cost(current, right) ?? Infinity)
        || waypointIds[left].localeCompare(waypointIds[right])
      )[0];
      const leg = cost(current, next);
      if (leg === undefined) break;
      seconds += leg;
      indices.push(next);
      remaining.delete(next);
    }
    if (!remaining.size && (!winner || seconds < winner.seconds)) {
      winner = { ids: indices.map((index) => waypointIds[index]), seconds };
    }
  }
  return winner?.ids ?? null;
}
