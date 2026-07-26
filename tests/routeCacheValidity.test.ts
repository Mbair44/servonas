import assert from "node:assert/strict";
import test from "node:test";
import { canReuseCalculatedRoute } from "../lib/routing/cacheValidity.ts";

const ready = {
  status:"ready", drivingDistanceMeters:1200, drivingDurationSeconds:600,
  geometryRequired:true, aggregatePolyline:"road-geometry", hasSafeLegGeometry:false,
};

test("reuses only complete ready road routes", () => {
  assert.equal(canReuseCalculatedRoute(ready),true);
  assert.equal(canReuseCalculatedRoute({...ready,status:"stale"}),false);
  assert.equal(canReuseCalculatedRoute({...ready,drivingDistanceMeters:null}),false);
  assert.equal(canReuseCalculatedRoute({...ready,aggregatePolyline:null}),false);
});

test("safe leg geometry makes a private-endpoint route reusable", () => {
  assert.equal(canReuseCalculatedRoute({...ready,aggregatePolyline:null,hasSafeLegGeometry:true}),true);
  assert.equal(canReuseCalculatedRoute({...ready,geometryRequired:false,aggregatePolyline:null}),true);
});
