import assert from "node:assert/strict";
import test from "node:test";
import { googleAdsBidDollarsToMicros } from "../lib/googleAdsBid.ts";

test("converts customer-selected maximum bids from dollars to Google Ads micros", () => {
 assert.equal(googleAdsBidDollarsToMicros("1.50"), 1_500_000);
 assert.equal(googleAdsBidDollarsToMicros("3.00"), 3_000_000);
 assert.equal(googleAdsBidDollarsToMicros("2"), 2_000_000);
});

test("rejects zero, negative, malformed, and over-precise maximum bids", () => {
 for (const value of ["0", "-1", "1.999", "2e2", "$2.00", "", "two"]) assert.equal(googleAdsBidDollarsToMicros(value), null);
});
