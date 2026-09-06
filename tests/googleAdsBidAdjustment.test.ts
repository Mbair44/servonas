import assert from "node:assert/strict";
import test from "node:test";
import { googleAdsBidDollarsToMicros,googleAdsRecommendedAdGroupMaxCpcMicros } from "../lib/googleAdsBid.ts";

test("converts customer-selected maximum bids from dollars to Google Ads micros", () => {
 assert.equal(googleAdsBidDollarsToMicros("1.50"), 1_500_000);
 assert.equal(googleAdsBidDollarsToMicros("3.00"), 3_000_000);
 assert.equal(googleAdsBidDollarsToMicros("2"), 2_000_000);
});

test("rejects zero, negative, malformed, and over-precise maximum bids", () => {
 for (const value of ["0", "-1", "1.999", "2e2", "$2.00", "", "two"]) assert.equal(googleAdsBidDollarsToMicros(value), null);
});

test("suggests a bounded ad-group max CPC from real click cost when available",()=>{
 assert.equal(googleAdsRecommendedAdGroupMaxCpcMicros({costMicros:6_000_000,clicks:3,dailyBudgetMicros:20_000_000}),2_500_000);
 assert.equal(googleAdsRecommendedAdGroupMaxCpcMicros({campaignBidMicros:2_000_000,dailyBudgetMicros:10_000_000}),2_000_000);
 assert.equal(googleAdsRecommendedAdGroupMaxCpcMicros({currentBidMicros:10_000_000,dailyBudgetMicros:10_000_000}),3_500_000);
});
