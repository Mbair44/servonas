import assert from "node:assert/strict";
import test from "node:test";
import { isRouteEditConflict, parseRoutePlanVersion, ROUTE_EDIT_CONFLICT_MESSAGE } from "../lib/routing/concurrency.ts";

test("accepts only positive safe route-plan versions", () => {
  assert.equal(parseRoutePlanVersion("12"), 12);
  assert.equal(parseRoutePlanVersion("0"), null);
  assert.equal(parseRoutePlanVersion("stale"), null);
});

test("recognizes database serialization conflicts and safe conflict text", () => {
  assert.equal(isRouteEditConflict({ code: "40001" }), true);
  assert.equal(isRouteEditConflict({ message: ROUTE_EDIT_CONFLICT_MESSAGE }), true);
  assert.equal(isRouteEditConflict({ code: "23505" }), false);
});
