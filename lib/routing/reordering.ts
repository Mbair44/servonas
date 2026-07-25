export type ReorderableStop = {
  id: string;
  isLocked: boolean;
  status: string;
};

export function canMoveStop(stops: ReorderableStop[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= stops.length) return false;
  const moving = stops[index], displaced = stops[target];
  return !moving.isLocked && !displaced.isLocked
    && moving.status !== "completed" && displaced.status !== "completed";
}

export function moveStop(stops: ReorderableStop[], index: number, direction: -1 | 1) {
  if (!canMoveStop(stops, index, direction)) return stops;
  const reordered = [...stops];
  const [moving] = reordered.splice(index, 1);
  reordered.splice(index + direction, 0, moving);
  return reordered;
}
