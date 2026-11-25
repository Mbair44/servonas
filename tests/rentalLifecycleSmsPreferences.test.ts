import assert from "node:assert/strict";
import test from "node:test";
import {isRentalLifecycleSmsSuppressed} from "../lib/communications/rentalLifecycleSmsPreferences.ts";

test("job SMS exceptions only suppress their matching rental lifecycle text", () => {
  assert.equal(isRentalLifecycleSmsSuppressed("reminder", {suppress_rental_reminder_sms: true}), true);
  assert.equal(isRentalLifecycleSmsSuppressed("technician_en_route", {suppress_rental_reminder_sms: true}), false);
  assert.equal(isRentalLifecycleSmsSuppressed("technician_en_route", {suppress_technician_en_route_sms: true}), true);
  assert.equal(isRentalLifecycleSmsSuppressed("payment_receipt", {suppress_technician_en_route_sms: true}), false);
});
