export function safeRoadGeometries(
  aggregatePolyline: string | null | undefined,
  legs: Array<{ calculation_status: string; encoded_polyline: string | null }>,
) {
  // Legs are tied to the current ordered stops. An aggregate can survive an
  // interrupted recalculation, so only use it when no current leg geometry is
  // available.
  const encodedPolylines = legs
    .filter((leg) => leg.calculation_status === "ready" && Boolean(leg.encoded_polyline))
    .map((leg) => leg.encoded_polyline!);
  if (encodedPolylines.length) return { encodedPolyline: null, encodedPolylines };
  if (aggregatePolyline) return { encodedPolyline: aggregatePolyline, encodedPolylines: [] };
  return {
    encodedPolyline: null,
    encodedPolylines: [],
  };
}
