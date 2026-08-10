import assert from "node:assert/strict";
import test from "node:test";
import { createBusinessTwilioProvider, type BusinessTwilioRepository, type StoredBusinessTwilioAccount } from "../lib/twilio/businessTwilioProvider.ts";
import { getTwilioCredentials } from "../lib/communications/twilioCredentials.ts";
import { canProvisionBusinessTwilioSubaccount } from "../lib/twilio/provisioningAccess.ts";

const businessA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const businessB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function harness() {
  const records = new Map<string, StoredBusinessTwilioAccount>();
  let creates = 0;
  let failWith: Error | null = null;
  const row = (businessId: string, status: StoredBusinessTwilioAccount["provisioning_status"] = "provisioning"): StoredBusinessTwilioAccount => ({
    id: `row-${businessId}`, business_id: businessId, twilio_subaccount_sid: null,
    twilio_subaccount_friendly_name: null, twilio_subaccount_status: null,
    provisioning_status: status, provisioning_error: null,
    created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(), last_synced_at: null,
  });
  const repository: BusinessTwilioRepository = {
    async getBusiness(id) { return [businessA, businessB].includes(id) ? { id, name: id === businessA ? "Business A" : "Business B" } : null; },
    async getAccount(id) { return records.get(id) ?? null; },
    async insertProvisioning(id, friendlyName) { if (records.has(id)) return null; const value = { ...row(id), twilio_subaccount_friendly_name: friendlyName, updated_at: new Date().toISOString() }; records.set(id, value); return value; },
    async markProvisioning(id, friendlyName) { const value = [...records.values()].find(item => item.id === id)!; Object.assign(value, { provisioning_status: "provisioning", provisioning_error: null, twilio_subaccount_friendly_name: friendlyName, updated_at: new Date().toISOString() }); return value; },
    async markActive(id, account) { const value = [...records.values()].find(item => item.id === id)!; Object.assign(value, { provisioning_status: "active", twilio_subaccount_sid: account.sid, twilio_subaccount_friendly_name: account.friendly_name, twilio_subaccount_status: account.status, last_synced_at: new Date().toISOString() }); return value; },
    async markFailed(id, message) { const value = [...records.values()].find(item => item.id === id)!; Object.assign(value, { provisioning_status: "failed", provisioning_error: message, updated_at: new Date().toISOString() }); },
  };
  const parentClient = {
    async findSubaccountByFriendlyName() { return null; },
    async createSubaccount(friendlyName: string) { creates += 1; if (failWith) throw failWith; return { sid: `AC${"1".repeat(32)}`, friendly_name: friendlyName, status: "active" }; },
  };
  return { records, repository, parentClient, creates: () => creates, fail: (error: Error | null) => { failWith = error; } };
}

test("legacy Twilio credentials still prefer API keys and retain the legacy sender", () => {
  const previous = { ...process.env };
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACparent", TWILIO_API_KEY_SID: "SKkey", TWILIO_API_KEY_SECRET: "secret", TWILIO_AUTH_TOKEN: "fallback", TWILIO_PHONE_NUMBER: "+14805550123" });
  const credentials = getTwilioCredentials();
  assert.equal(credentials.authentication, "api_key");
  assert.equal(credentials.username, "SKkey");
  assert.equal(credentials.from, "+14805550123");
  process.env = previous;
});

test("repeated provisioning returns one business subaccount without creating another", async () => {
  const h = harness();
  const provider = createBusinessTwilioProvider(h);
  const first = await provider.getOrCreateBusinessTwilioSubaccount(businessA);
  const second = await provider.getOrCreateBusinessTwilioSubaccount(businessA);
  assert.equal(first.subaccountSid, second.subaccountSid);
  assert.equal(h.creates(), 1);
  assert.equal(h.records.size, 1);
});

test("tenant contexts remain isolated by business id and contain no credentials", async () => {
  const h = harness();
  const provider = createBusinessTwilioProvider(h);
  await provider.getOrCreateBusinessTwilioSubaccount(businessA);
  assert.equal(await provider.getBusinessTwilioContext(businessB), null);
  const context = await provider.getBusinessTwilioContext(businessA);
  assert.equal(context?.businessId, businessA);
  assert.equal("authToken" in (context ?? {}), false);
  assert.equal("credentials" in (context ?? {}), false);
});

test("only confirmed Servonas platform admins can provision", () => {
  assert.equal(canProvisionBusinessTwilioSubaccount({ email: "admin@servonas.com", email_confirmed_at: "2026-08-10T00:00:00Z" }), true);
  assert.equal(canProvisionBusinessTwilioSubaccount({ email: "owner@example.com", email_confirmed_at: "2026-08-10T00:00:00Z" }), false);
  assert.equal(canProvisionBusinessTwilioSubaccount({ email: "admin@servonas.com", email_confirmed_at: null }), false);
});

test("Twilio failures enter a sanitized retryable failed state and can retry", async () => {
  const h = harness();
  const provider = createBusinessTwilioProvider(h);
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => { logged.push(values); };
  h.fail(new Error(`Authorization Basic secret-value failed for AC${"9".repeat(32)}`));
  await assert.rejects(provider.getOrCreateBusinessTwilioSubaccount(businessA), /can be retried/);
  console.error = originalError;
  const failed = h.records.get(businessA)!;
  assert.equal(failed.provisioning_status, "failed");
  assert.doesNotMatch(failed.provisioning_error!, /secret-value|AC999/);
  assert.deepEqual(logged, []);
  h.fail(null);
  const retried = await provider.getOrCreateBusinessTwilioSubaccount(businessA);
  assert.equal(retried.provisioningStatus, "active");
});
