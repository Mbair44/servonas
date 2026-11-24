import test from "node:test";
import assert from "node:assert/strict";
import {isPaidSubscriptionPlan,subscriptionPlanPriceCents} from "../lib/pricing/subscriptionPlans.ts";
test("only Growth and Scale require Servonas subscriptions",()=>{
 assert.equal(isPaidSubscriptionPlan("growth"),true);assert.equal(isPaidSubscriptionPlan("scale"),true);assert.equal(isPaidSubscriptionPlan("starter"),false);
 assert.equal(subscriptionPlanPriceCents("starter"),0);assert.equal(subscriptionPlanPriceCents("growth"),5_000);assert.equal(subscriptionPlanPriceCents("scale"),15_000);
});
