import assert from "node:assert/strict";
import test from "node:test";
import { territoryMapPolygons, visibleTerritories } from "../lib/territoryMap.ts";

test("converts GeoJSON longitude latitude coordinates for Google Maps", () => {
  const polygons = territoryMapPolygons({
    type: "Polygon",
    coordinates: [[[-112.1, 33.4], [-112, 33.5], [-112.1, 33.4]]],
  });
  assert.deepEqual(polygons[0][0][0], { lat: 33.4, lng: -112.1 });
});

test("preserves every polygon in a multi-polygon territory", () => {
  const polygons = territoryMapPolygons({
    type: "MultiPolygon",
    coordinates: [
      [[[-112.1, 33.4], [-112, 33.5], [-112.1, 33.4]]],
      [[[-111.9, 33.3], [-111.8, 33.4], [-111.9, 33.3]]],
    ],
  });
  assert.equal(polygons.length, 2);
});

test("hides archived territories unless the overlay is enabled", () => {
  const territories = [{ id: "active", is_active: true }, { id: "archived", is_active: false }];
  assert.deepEqual(visibleTerritories(territories, false).map((item) => item.id), ["active"]);
  assert.equal(visibleTerritories(territories, true).length, 2);
});
