# Twilio multi-tenant architecture — Phase 2

Phase 2 adds tenant compliance state, local-number search, and idempotent number purchasing. It does **not** migrate existing SMS, create Messaging Services, submit A2P brands/campaigns, or change the legacy sender.

## Resource ownership

- The Servonas Primary Customer Profile and each end-business Secondary Customer Profile live in the **parent Twilio account**. Twilio requires the approved primary and secondary profiles to be in the same account. Parent Trust Hub calls use the parent Main API key (`TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`).
- Purchased phone numbers live in the existing **business subaccount**. Core phone-number API calls target `/Accounts/{businessSubaccountSid}` while authenticating with the parent Main API key.
- Servonas stores provider SIDs and sanitized state only. It does not store tax IDs, API secrets, auth headers, or subaccount Auth Tokens.

## Configuration

- Existing Phase 1 variables: `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`.
- Parent callback validation: `TWILIO_AUTH_TOKEN` and optional exact public URL `TWILIO_COMPLIANCE_STATUS_WEBHOOK_URL`.
- Draft Secondary Customer Profile creation: `TWILIO_SECONDARY_CUSTOMER_PROFILE_POLICY_SID`.
- Apply `20260810000300_twilio_phase_2_compliance_and_numbers.sql` before using endpoints.

## Platform-admin endpoints

- `GET /api/admin/twilio/compliance/{businessId}` — local status.
- `POST /api/admin/twilio/compliance/{businessId}/sync` — fetch current Trust Hub status.
- `POST /api/admin/twilio/phone-numbers/search` — body: `businessId`, `areaCode`, optional `fallbackAreaCodes`, `mms`, `voice`.
- `POST /api/admin/twilio/phone-numbers/purchase` — body: `businessId`, `phoneNumber` (E.164).

All use normal Servonas authentication and require a confirmed platform admin. They never return credentials.

## Explicit blockers and safe boundaries

Servonas's parent Primary Customer Profile must be approved and the exact Secondary Customer Profile policy/end-user/supporting-document field set confirmed before automated registration submission is enabled. The current provider creates/synchronizes the profile shell only; it never submits, modifies, or associates an existing rejected manual profile. Copper State Bounce is not automatically touched.

Twilio validates an inbound webhook with the Auth Token of the account that owns the number. Phase 1 deliberately discarded subaccount Auth Tokens and Servonas currently has no KMS/Vault-backed resolver. Therefore a purchased number is recorded as `pending_webhook_security` and its `SmsUrl` is not enabled. `SubaccountWebhookSecretResolver` is the narrow future integration point. The inbound route already resolves `AccountSid + To` and refuses tenant traffic unless the correct token can be retrieved; it never falls back to the parent token. Existing parent-account SMS validation and behavior remain intact.

Before Phase 3: finish/approve the Servonas primary ISV profile, confirm Twilio's policy field requirements, add secure subaccount webhook-token retrieval, then configure the number's SMS URL. Phase 3 can add Messaging Services and A2P registration/association.
