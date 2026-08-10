# Twilio multi-tenant architecture — Phase 2.5

Phase 2.5 secures each Twilio subaccount Auth Token for webhook verification. It does not add Messaging Services, A2P, MMS, voice, or migrate existing traffic.

## Storage audit and decision

The repository previously contained only static Vercel environment secrets and no dynamic tenant secret store, KMS, or encryption layer. Servonas already uses Supabase as its server database, so this phase uses **Supabase Vault**, not application cryptography. Vault encrypts secrets using authenticated encryption and a Supabase-managed per-project key held outside the database. Ordinary public tables contain only an opaque Vault UUID and safe readiness metadata.

Migration `20260810000400_twilio_subaccount_vault_secrets.sql` enables `supabase_vault`, adds non-secret metadata to `business_twilio_accounts`, creates lifecycle audit metadata, and exposes three `SECURITY DEFINER` RPCs callable only by `service_role`. Neither `anon` nor `authenticated` can call the functions or write provider metadata.

## Provisioning and recovery

When a new subaccount is created, the returned `auth_token` is passed directly to `store_twilio_subaccount_auth_token`. It is never placed in a normal table, response, or log. The account is marked active only after Vault succeeds.

If Vault fails after Twilio creation, the local account records a generic failed/security state. A retry searches by the deterministic friendly name, fetches the existing account, stores its returned token, and does not create another subaccount.

For an existing subaccount such as Copper State Bounce, an authenticated platform admin can inspect:

`GET /api/admin/twilio/subaccounts/{businessId}/security`

An explicit later remediation can call:

`POST /api/admin/twilio/subaccounts/{businessId}/security`

The POST fetches only the already-mapped subaccount SID through Twilio's parent Accounts API and stores the returned token in Vault. Credential recovery specifically uses the parent Account SID and parent Auth Token, matching Twilio's documented Accounts API example; normal provisioning continues to prefer the Main API key. It contains no create call and returns metadata only. It has not been invoked for Copper State Bounce by the implementation process.

The first production remediation attempt failed before the original route recorded a failure stage or upstream HTTP status. That historical status cannot be reconstructed from the generic 502 response. The corrected route records only safe telemetry (`stage`, Twilio HTTP status, Twilio numeric error code) and returns a safe `failureStage`; it never logs provider messages, authorization headers, or tokens. A `twilio_recovery` failure proves Vault was not called, while `vault_storage` proves the Twilio fetch succeeded and Vault was attempted.

The server-only `rotateExistingBusinessTwilioSecret` primitive implements Twilio's secondary-token then promotion sequence and updates Vault only with the promoted token. It is deliberately not exposed by an API in this phase; rotation must be an explicit later operational action. If promotion succeeds but Vault is temporarily unavailable, the parent Accounts API reconciliation path can recover the current token.

## Inbound validation

1. Read `AccountSid` and destination `To` from the signed Twilio form.
2. If `AccountSid` is the configured parent account, retain the legacy parent-token path.
3. Otherwise resolve the persisted `AccountSid + To` mapping to a business.
4. Retrieve Vault data using both `businessId + subaccountSid`.
5. Validate `X-Twilio-Signature` over the exact configured external URL and complete form parameters.
6. Fail closed for an unknown mapping, missing Vault secret, or invalid signature. Never fall back to the parent token.

The Trust Hub compliance profile remains parent-owned, so `/api/twilio/compliance-status` correctly continues to validate with the parent Auth Token.

Future number searches and purchases authenticate to tenant Core API resources with the subaccount SID and Vault token. A newly purchased number can safely receive the existing inbound URL. No purchase is performed by this phase.

## Deployment order

1. Confirm Vault is available in the target Supabase project.
2. Apply Phase 2 migration `20260810000300...` if it is not already applied.
3. Apply `20260810000400_twilio_subaccount_vault_secrets.sql`.
4. Verify the restricted RPC grants and that `anon`/`authenticated` cannot execute them.
5. Deploy the application.
6. Call the read-only security diagnostic for a test business.
7. For Copper State Bounce only after explicit approval, call the remediation POST once and repeat the GET to verify `available`. Do not provision another account.
8. Send a Twilio-signed test webhook only after a number is mapped; verify invalid signatures return 403 first.

Supabase Vault availability and the migration must be verified manually in the connected project; this workspace does not contain production database credentials or a Supabase CLI connection.
