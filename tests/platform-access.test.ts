import assert from "node:assert/strict";
import test from "node:test";
import { isServonasPlatformAdmin } from "../lib/platformAccess.ts";

test("allows only confirmed exact servonas.com email accounts", () => {
  assert.equal(isServonasPlatformAdmin({
    email: "owner@servonas.com",
    email_confirmed_at: "2026-07-23T12:00:00.000Z",
  }), true);
  assert.equal(isServonasPlatformAdmin({
    email: "OWNER@SERVONAS.COM",
    email_confirmed_at: "2026-07-23T12:00:00.000Z",
  }), true);
  assert.equal(isServonasPlatformAdmin({
    email: "owner@servonas.com",
    email_confirmed_at: null,
  }), false);
  assert.equal(isServonasPlatformAdmin({
    email: "owner@servonas.com.example",
    email_confirmed_at: "2026-07-23T12:00:00.000Z",
  }), false);
});
