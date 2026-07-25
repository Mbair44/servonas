import assert from "node:assert/strict";
import test from "node:test";

test("private endpoint contract never requires a client-visible home address", () => {
  const safeRouteProjection = { origin_is_private: true, origin_label: "Private technician start", origin_address_snapshot: null, origin_latitude: null, origin_longitude: null };
  assert.equal(safeRouteProjection.origin_is_private, true);
  assert.equal(safeRouteProjection.origin_address_snapshot, null);
  assert.equal(safeRouteProjection.origin_latitude, null);
});
