import assert from "node:assert/strict";
import test from "node:test";
import { canMoveStop, moveStop } from "../lib/routing/reordering.ts";

const stops = [
  { id: "a", isLocked: false, status: "scheduled" },
  { id: "b", isLocked: false, status: "scheduled" },
  { id: "c", isLocked: false, status: "scheduled" },
];

test("moves a route stop by one accessible step", () => {
  assert.deepEqual(moveStop(stops, 1, -1).map((stop) => stop.id), ["b", "a", "c"]);
});

test("does not move beyond route boundaries", () => {
  assert.equal(canMoveStop(stops, 0, -1), false);
  assert.equal(canMoveStop(stops, 2, 1), false);
});

test("locked and completed stops protect both sides of a move", () => {
  assert.equal(canMoveStop([{ ...stops[0], isLocked: true }, stops[1]], 1, -1), false);
  assert.equal(canMoveStop([stops[0], { ...stops[1], status: "completed" }], 0, 1), false);
});
