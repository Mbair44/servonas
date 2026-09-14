# Copper State Bounce controlled SMS test

This path reuses existing resources. It does not buy numbers or register replacement Brands/campaigns. Existing booking/campaign/notification callers remain unchanged. Tenant inbound messages are stored without invoking legacy parent-account auto-replies or missed-call automation.

## Deployment

1. Apply `supabase/migrations/20260914000800_tenant_sms_pilot.sql` after the existing Twilio migrations. It adds an overloaded tenant-bound inbound RPC and three small metadata columns/indexes to existing history/usage tables. No new tables. Keep the old four-argument inbound RPC for legacy parent traffic.
2. Deploy the application changes.
3. Verify the business record really is Copper State Bounce. Its candidate ID from the supplied application log is `cb25acc0-3623-4c06-9041-89a88f4ad6ed`; the UI also requires the configured business name to match Copper State Bounce.
4. Set production environment:
   - `TWILIO_SMS_TEST_BUSINESS_ID` = verified business ID
   - `TWILIO_SMS_TEST_LIVE_ENABLED=true`
   - Leave legacy `SMS_DELIVERY_MODE` unchanged; the pilot has its own explicit live flag.
   - existing `TWILIO_ACCOUNT_SID`, parent API key SID/secret, Supabase server configuration and tenant Vault token
   - `TWILIO_INBOUND_WEBHOOK_URL=https://<production-app-host>/api/twilio/inbound`
   - `TWILIO_TENANT_MESSAGE_STATUS_WEBHOOK_URL=https://<production-app-host>/api/twilio/tenant-message-status`
   Vercel preview/development deployments cannot use this test sender. On non-Vercel hosting, `NODE_ENV=production` is required. Leave the pilot live flag false outside production. Never copy production Vault data into preview databases.
5. Open Administration → SMS test (`/app/admin/twilio`) as a platform admin. Verification uses GET requests only and exposes SIDs/statuses, never auth tokens. The send button requires `ready`, live pilot flags, and available message/history storage.

## Readiness and existing resource configuration

Readiness checks the active tenant access/account, Vault token against Twilio's account API, parent ownership, matching local account associations, approved Brand linked to the expected Customer Profile and Trust Product, VERIFIED campaign linked to the same Brand/account/Messaging Service, live Messaging Service, SMS-capable owned number, its sender-pool membership, effective inbound URL/method and service delivery callback. Mock compliance resources are rejected. Missing resources are reported, not replaced.

For an existing resource not represented in local records, reconcile its SIDs into the existing account/compliance/activation/number records after verifying ownership in Twilio. Do not mark activation active by hand. The test action synchronizes from the live verifier immediately before sending.

In Twilio Console verify:
- Messaging Service sender pool contains the selected tenant phone number.
- Inbound integration uses the canonical inbound URL and POST, either on the Service or (if deferred) the number.
- Delivery Status Callback equals the configured status URL.
- Advanced Opt-Out is enabled and STOP/START/HELP replies are appropriate for the business. Servonas records `OptOutType` when supplied and does not send a second automatic reply. Standard keywords are also recognized when `OptOutType` is absent.
- Resources belong to the live account, not test/mock resources. Existing approvals are reused.

Preferred area codes are not a readiness condition. Any existing correctly configured tenant SMS number can pass. The selected verified number is explicitly supplied with the Messaging Service when sending, so another sender in the pool cannot unexpectedly handle the test.

## Exact manual test

1. Refresh the admin page; require `ready` and inspect the SIDs/statuses. This verifies configuration, not actual webhook reachability.
2. Enter a consenting test recipient in `+1XXXXXXXXXX` format and check the consent/charge acknowledgment. Click Send test SMS once.
3. Record the Message SID. `accepted` only confirms provider acceptance. Refresh and observe queued/sent/delivered or a useful error. The page separately shows when an authenticated delivery callback was received; provider reconciliation alone is not callback evidence.
4. Confirm the handset actually receives the SMS from the selected number.
5. Reply `TEST RECEIVED`. Verify Twilio's request inspector shows a successful POST to Servonas. The tenant Vault token must validate the signature.
6. Refresh the admin page and open its customer SMS inbox link. Match reply body, phone, Message SID, tenant/customer and received timestamp.
7. Replay the inbound POST with the same SID and a valid signature using Twilio's tooling or a server-side test harness. Confirm one inbound row/customer/activity event and no additional send. Repeat a delivery callback and then an older queued callback; confirm one usage row and no delivered→queued downgrade.
8. Reply STOP. Confirm local consent is opted out and another deliberate test attempt is blocked (21610). Reply HELP: confirm only Twilio's configured help response, no Servonas duplicate. Reply START: confirm local consent is restored; then initiate a new deliberate test.
9. Check the usage ledger after price reconciliation for segments/cost and confirm another tenant cannot access these messages.
10. Turn `TWILIO_SMS_TEST_LIVE_ENABLED=false` when testing is complete if continued test access is unnecessary.

A durable unique request claim prevents resubmitting the same form from sending again. A timeout/crash is shown as sending/unknown, never automatically retried; inspect Twilio logs before initiating a fresh request. Provider acceptance followed by a database failure retains the known SID where possible. This avoids claiming exactly-once delivery across an external API.

## Local verification

Run normal Twilio tests with Node. PostgreSQL integration testing uses a temporary PGlite runtime without adding a repository dependency:

```sh
npm install --prefix /tmp/servonas-sms-sql-check --no-save --ignore-scripts @electric-sql/pglite
PGLITE_RUNTIME=/tmp/servonas-sms-sql-check/node_modules/@electric-sql/pglite/dist/index.js node --test tests/twilioPilotDatabase.test.ts
```

The SQL fixture verifies migration execution, conflicting legacy settings, replay deduplication, tenant mismatch rejection, STOP/START/HELP and unique test claims. Mocked provider tests verify readiness rejection and callback replay. These do not establish production migration installation, live approval, handset delivery, callback reachability or inbox persistence on the deployed instance.

## Files changed in this SMS implementation

- `.env.example`
- `app/admin/page.tsx`
- `app/api/admin/twilio/activation/[businessId]/route.ts`
- `app/api/twilio/inbound/route.ts`
- `app/api/twilio/tenant-message-status/route.ts`
- `app/app/admin/twilio/page.tsx`
- `app/app/admin/twilio/testActions.ts`
- `lib/twilio/inboundWebhookSecurity.ts`
- `lib/twilio/liveReadiness.ts`
- `lib/twilio/messageUsage.ts`
- `lib/twilio/phase3Activation.ts`
- `lib/twilio/tenantOutboundSender.ts`
- `lib/twilio/testSms.ts`
- `supabase/migrations/20260914000800_tenant_sms_pilot.sql`
- `tests/twilioPilotReadiness.test.ts`
- `tests/twilioPilotCallbacks.test.ts`
- `tests/twilioPilotDatabase.test.ts`
- `tests/fixtures/twilioPilotSchema.sql`
- `docs/twilio-copper-state-sms-test.md`

The pre-existing job assignment error-reporting changes in this checkout are unrelated and were not modified by this SMS implementation.
