export function safeRoadGeometries(
  aggregatePolyline: string | null | undefined,
  legs: Array<{ calculation_status: string; encoded_polyline: string | null }>,
) {
  if (aggregatePolyline) return { encodedPolyline: aggregatePolyline, encodedPolylines: [] };
  return {
    encodedPolyline: null,
    encodedPolylines: legs
      .filter((leg) => leg.calculation_status === "ready" && Boolean(leg.encoded_polyline))
      .map((leg) => leg.encoded_polyline!),
  };
}
