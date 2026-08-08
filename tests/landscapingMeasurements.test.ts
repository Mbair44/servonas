import assert from "node:assert/strict";
import test from "node:test";
import { lineFeet, normalizeLandscapeShapes, polygonSquareFeet } from "../lib/landscapingMeasurements.ts";

test("calculates a traced line in feet", () => {
  const feet = lineFeet([{ lat: 33, lng: -112 }, { lat: 33.0001, lng: -112 }]);
  assert.ok(feet > 36 && feet < 37);
});

test("calculates a closed property area in square feet", () => {
  const area = polygonSquareFeet([
    { lat: 33, lng: -112 }, { lat: 33, lng: -111.9999 },
    { lat: 33.0001, lng: -111.9999 }, { lat: 33.0001, lng: -112 },
  ]);
  assert.ok(area > 1_000 && area < 1_300);
});

test("normalization ignores supplied totals and recalculates them", () => {
  const shapes = normalizeLandscapeShapes([{ id:"yard", kind:"lawn", label:"Back yard", areaSqFt:999999, points:[{lat:33,lng:-112},{lat:33,lng:-111.9999},{lat:33.0001,lng:-111.9999},{lat:33.0001,lng:-112}] }]);
  assert.equal(shapes.length, 1);
  assert.notEqual(shapes[0].areaSqFt, 999999);
});
