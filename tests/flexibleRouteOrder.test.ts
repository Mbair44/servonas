import assert from "node:assert/strict";
import test from "node:test";
import { shortestFlexibleRoute } from "../lib/routing/flexibleRouteOrder.ts";
import type { RouteMatrixCell } from "../lib/routing/domain.ts";

const matrix = (ids:string[], durations:Record<string,number>):RouteMatrixCell[] =>
  ids.flatMap(origin => ids.map(destination => ({
    originWaypointId:origin,
    destinationWaypointId:destination,
    status:"ready" as const,
    drivingDistanceMeters:durations[`${origin}:${destination}`] ?? 0,
    drivingDurationSeconds:durations[`${origin}:${destination}`] ?? 0,
  })));

test("globally orders flexible stops instead of accepting a local adjacent minimum",()=>{
  const ids=["one","two","three","four"];
  const durations:Record<string,number>={};
  for(const from of ids)for(const to of ids)durations[`${from}:${to}`]=from===to?0:100;
  durations["one:two"]=1;
  durations["two:four"]=1;
  durations["four:three"]=1;
  assert.deepEqual(shortestFlexibleRoute(ids,matrix(ids,durations)),["one","two","four","three"]);
});

test("returns null when the matrix cannot connect every flexible stop",()=>{
  assert.equal(shortestFlexibleRoute(["one","two"],[]),null);
});
