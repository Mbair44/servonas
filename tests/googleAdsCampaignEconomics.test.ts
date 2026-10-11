import test from "node:test";
import assert from "node:assert/strict";
import {campaignEconomics,googleCampaignSpendCents} from "../lib/googleAdsCampaignEconomics.ts";

test("Google campaign spend uses stable campaign IDs and rejects non-USD facts",()=>{
 const spend=googleCampaignSpendCents([{campaign_id:"101",spend_amount:"58.99",currency:"USD"},{campaign_id:"101",spend_amount:1.01,currency:"USD"},{campaign_id:"202",spend_amount:10,currency:"CAD"}]);
 assert.equal(spend.get("101"),6000);assert.equal(spend.get("202"),null);
});
test("campaign economics never treats unavailable spend or zero denominators as zero",()=>{
 assert.deepEqual(campaignEconomics({spendCents:6000,visits:40,bookingStarts:6,bookings:0,revenueCents:0}),{costPerVisitCents:150,costPerBookingStartCents:1000,costPerBookingCents:null,roas:0});
 assert.equal(campaignEconomics({spendCents:null,visits:40,bookingStarts:6,bookings:1,revenueCents:10000}).costPerVisitCents,null);
});
