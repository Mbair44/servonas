#!/usr/bin/env node

const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET",
  "STRIPE_SERVONAS_GROWTH_PRICE_ID",
  "STRIPE_SERVONAS_SCALE_PRICE_ID",
];

const missing = required.filter((key) => !process.env[key]?.trim());
const errors = [
  ...missing.map((key) => `missing ${key}`),
  ...(process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")
    ? ["STRIPE_SECRET_KEY must be an sk_test_ key"]
    : []),
  ...(process.env.SERVONAS_PLATFORM_FEE_TEST_MODE !== "true"
    ? ["SERVONAS_PLATFORM_FEE_TEST_MODE must be exactly true"]
    : []),
  ...["STRIPE_SERVONAS_GROWTH_PRICE_ID", "STRIPE_SERVONAS_SCALE_PRICE_ID"]
    .filter((key) => process.env[key] && !process.env[key].startsWith("price_"))
    .map((key) => `${key} must be a Stripe Price ID`),
];

if (errors.length) {
  console.error("Stripe test-mode pricing preflight failed:\n- " + errors.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Stripe test-mode pricing preflight passed. No Stripe or Twilio API calls were made.");
}
