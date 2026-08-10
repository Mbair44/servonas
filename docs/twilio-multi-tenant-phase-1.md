# Twilio multi-tenant architecture: Phase 1

```text
Twilio parent account (Servonas LLC)
  -> Servonas server-only provider
    -> one Twilio subaccount per Servonas business
      -> future: compliance, Messaging Service, phone number, SMS/MMS/voice
```

Phase 1 creates only the business subaccount boundary. It does not purchase numbers, create Messaging Services, configure webhooks, register Trust Hub/A2P resources, or send messages from subaccounts.

## Credentials

Parent operations prefer `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`, falling back to the parent `TWILIO_AUTH_TOKEN`, matching the legacy integration. These values remain server environment variables. The configured API key must be a Twilio **Main** key because Standard keys cannot access the `/Accounts` resource. Twilio returns a subaccount Auth Token when an account is created; Phase 1 deliberately discards it and stores no secret in Supabase. Parent credentials are sufficient for current provisioning operations.

A later webhook phase may need the subaccount Auth Token to validate Twilio signatures. Before that phase, Servonas needs a managed secret store or established envelope-encryption service. The database should hold only an opaque secret reference in a separate service-role-only table if retention becomes necessary. Plaintext secret columns are not acceptable.

## Provisioning and migration safety

`business_twilio_accounts` stores one non-secret status record per business. Provisioning checks for an existing SID, then checks Twilio for the deterministic friendly name before creating anything. This makes retries recoverable if Twilio succeeded before the local record was updated. A unique business constraint prevents multiple local account records.

The admin endpoint is `POST /api/admin/twilio/subaccounts` with JSON `{ "businessId": "..." }`. It requires a signed-in, confirmed `@servonas.com` platform administrator. No customer UI invokes it, and Copper State Bounce is not automatically provisioned.

## Legacy functionality still active

All outbound booking, party-rental, campaign, inbound SMS, and missed-call recovery paths continue using the existing global Twilio environment configuration and `TWILIO_PHONE_NUMBER`. Phase 1 does not route any production message or webhook through a subaccount.
