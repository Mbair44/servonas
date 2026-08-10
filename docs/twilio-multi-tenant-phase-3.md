# Twilio multi-tenant Phase 3

Phase 3 registers an eligible tenant for A2P messaging and cuts outbound campaign SMS over to that tenant's Messaging Service only after Twilio approval. Existing SMS remains on the legacy sender until that final approval.

## Safety boundaries

- `GET /api/admin/twilio/activation/{businessId}` is read-only.
- `POST /api/admin/twilio/activation/{businessId}` may create a Brand, Messaging Service, Campaign, and associate an already selected tenant number. Brand and Campaign registration may incur Twilio charges.
- `POST /api/admin/twilio/activation/{businessId}/sync` reads the Campaign from Twilio and updates local activation state. It does not create or purchase resources.
- Phase 3 never purchases a telephone number.
- The activation POST requires an authenticated Servonas platform administrator, an `ACTIVATE` confirmation, and explicit acknowledgement of charges.
- Activation is blocked until the Servonas Primary Customer Profile and tenant Secondary Customer Profile are approved and the tenant has an A2P Trust Product, subaccount Vault credential, and selected number.

## Deployment

1. Apply `20260811000100_twilio_phase_3_activation.sql` to Supabase.
2. Set `TWILIO_PRIMARY_CUSTOMER_PROFILE_SID` to the approved Servonas Primary Customer Profile SID.
3. Set `TWILIO_TENANT_MESSAGE_STATUS_WEBHOOK_URL` to the canonical production callback URL.
4. Keep the existing parent API key, parent Auth Token, and Phase 2.5 Vault configuration.
5. Deploy the application.
6. Sign in as a Servonas platform administrator and open `/app/admin/twilio`.
7. Select a tenant and verify every readiness check before submitting activation.

## Cutover and rollback behavior

The service stores only Twilio resource SIDs and state; tenant Auth Tokens stay in Supabase Vault. Campaign SMS uses the tenant subaccount and Messaging Service only when local state is `active`. Missing credentials, pending compliance, or any incomplete activation continues using the legacy sender. Tenant status callbacks are signature-validated with the tenant's Vault credential.
