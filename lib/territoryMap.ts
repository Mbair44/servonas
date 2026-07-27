export type TerritoryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export const territoryMapPolygons = (geometry: TerritoryGeometry) => {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];
  return polygons.map((polygon) => polygon.map((ring) =>
    ring.map(([longitude, latitude]) => ({ lat: Number(latitude), lng: Number(longitude) }))
  ));
};

export const visibleTerritories = <T extends { is_active: boolean }>(territories: T[], showInactive: boolean) =>
  territories.filter((territory) => territory.is_active || showInactive);

export function validateTerritoryGeometry(geometry: TerritoryGeometry | null): string | null {
  if (!geometry) return null;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates as number[][][][]
      : [];
  if (!polygons.length) return "Draw at least one valid polygon.";
  for (const polygon of polygons) {
    if (!polygon.length) return "Every polygon needs an exterior boundary.";
    for (const ring of polygon) {
      if (ring.length < 4) return "Every polygon ring needs at least three vertices.";
      const [firstLongitude, firstLatitude] = ring[0] ?? [];
      const [lastLongitude, lastLatitude] = ring.at(-1) ?? [];
      if (firstLongitude !== lastLongitude || firstLatitude !== lastLatitude) return "Polygon rings must be closed.";
      for (const coordinate of ring) {
        if (coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])
          || coordinate[0] < -180 || coordinate[0] > 180 || coordinate[1] < -90 || coordinate[1] > 90) {
          return "Polygon coordinates must contain valid longitude and latitude values.";
        }
      }
    }
  }
  return null;
}
