import assert from "node:assert/strict";
import test from "node:test";
import { safeRoadGeometries } from "../lib/routing/geometrySelection.ts";

test("uses current leg geometry before an aggregate polyline", () => {
  assert.deepEqual(safeRoadGeometries("aggregate", [{ calculation_status:"ready",encoded_polyline:"leg" }]), {
    encodedPolyline:null, encodedPolylines:["leg"],
  });
});

test("falls back to safe ready leg geometry for private endpoint routes", () => {
  assert.deepEqual(safeRoadGeometries(null, [
    { calculation_status:"ready",encoded_polyline:null },
    { calculation_status:"ready",encoded_polyline:"safe-middle-leg" },
    { calculation_status:"failed",encoded_polyline:"invalid-leg" },
  ]), { encodedPolyline:null,encodedPolylines:["safe-middle-leg"] });
});

test("uses aggregate geometry when no ready leg geometry exists", () => {
  assert.deepEqual(safeRoadGeometries("aggregate", [
    { calculation_status:"failed",encoded_polyline:null },
  ]), { encodedPolyline:"aggregate",encodedPolylines:[] });
});
