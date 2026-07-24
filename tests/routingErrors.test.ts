import assert from "node:assert/strict";
import test from "node:test";

import { publicRouteCalculationError } from "../lib/routing/errors.ts";

test("routing errors expose safe Google status and reason", () => {
  const message = publicRouteCalculationError(new Error(
    'Google Routes request failed (403): {"error":{"status":"PERMISSION_DENIED","message":"Routes API is disabled"}}',
  ));
  assert.equal(message, "Google Routes returned HTTP 403: PERMISSION_DENIED: Routes API is disabled");
});

test("routing errors identify missing routing schema without exposing internals", () => {
  assert.equal(
    publicRouteCalculationError(new Error("Route plan could not be prepared (42P01).")),
    "Routing database operation failed (42P01). Confirm the Epic 7 routing migration is installed.",
  );
});

test("routing errors redact Google API keys", () => {
  assert.doesNotMatch(
    publicRouteCalculationError(new Error("Failure using AIzaAbcdefghijklmnopqrstuvwxyz123456")),
    /AIza/,
  );
});
