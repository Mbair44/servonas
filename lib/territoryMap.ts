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
