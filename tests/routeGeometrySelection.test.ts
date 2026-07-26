import assert from "node:assert/strict";
import test from "node:test";
import { safeRoadGeometries } from "../lib/routing/geometrySelection.ts";

test("uses the aggregate road polyline when it is safe to expose", () => {
  assert.deepEqual(safeRoadGeometries("aggregate", [{ calculation_status:"ready",encoded_polyline:"leg" }]), {
    encodedPolyline:"aggregate", encodedPolylines:[],
  });
});

test("falls back to safe ready leg geometry for private endpoint routes", () => {
  assert.deepEqual(safeRoadGeometries(null, [
    { calculation_status:"ready",encoded_polyline:null },
    { calculation_status:"ready",encoded_polyline:"safe-middle-leg" },
    { calculation_status:"failed",encoded_polyline:"invalid-leg" },
  ]), { encodedPolyline:null,encodedPolylines:["safe-middle-leg"] });
});
