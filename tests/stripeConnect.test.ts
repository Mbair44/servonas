import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { stripeConnectState,stripePaymentsReady } from "../lib/stripeConnect.ts";

const requirements=(patch:Partial<Stripe.Account.Requirements>={}):Stripe.Account.Requirements=>({
  alternatives:[],current_deadline:null,currently_due:[],disabled_reason:null,
  errors:[],eventually_due:[],past_due:[],pending_verification:[],...patch,
});
const account=(patch:Partial<Stripe.Account>={})=>({
  id:"acct_test",object:"account",created:1_700_000_000,
  details_submitted:false,charges_enabled:false,payouts_enabled:false,
  default_currency:"usd",country:"US",capabilities:{card_payments:"inactive"},
  requirements:requirements({currently_due:["business_profile.url"]}),
  ...patch,
}) as Stripe.Account;

test("Stripe account is ready only when onboarding, charges, and payouts are complete",()=>{
  const pending=stripeConnectState(account());
  assert.equal(pending.onboarding_status,"pending");
  assert.equal(stripePaymentsReady(pending),false);
  const complete=stripeConnectState(account({
    details_submitted:true,charges_enabled:true,payouts_enabled:true,
    requirements:requirements(),
  }));
  assert.equal(complete.onboarding_status,"complete");
  assert.equal(stripePaymentsReady(complete),true);
});

test("past-due requirements keep Stripe payment collection restricted",()=>{
  const restricted=stripeConnectState(account({
    details_submitted:true,charges_enabled:true,payouts_enabled:false,
    requirements:requirements({past_due:["company.tax_id"],disabled_reason:"requirements.past_due"}),
  }));
  assert.equal(restricted.onboarding_status,"restricted");
  assert.equal(restricted.disabled_reason,"requirements.past_due");
  assert.deepEqual(restricted.requirements_past_due,["company.tax_id"]);
  assert.equal(stripePaymentsReady(restricted),false);
});
