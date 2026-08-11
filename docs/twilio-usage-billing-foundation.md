# Twilio usage and monthly billing foundation

Migration: `20260810000700_twilio_usage_billing_foundation.sql`

`twilio_message_usage` is the canonical billing ledger for new tenant-routed Twilio traffic. Existing communication tables remain unchanged and continue to power their current product workflows. Legacy senders are not routed through the tenant sender by this phase.

Tenant inbound webhooks create an inbound ledger row after signature validation and normal inbound processing. `sendTenantTwilioMessage` creates outbound rows for future explicitly tenant-routed sends. Tenant status callbacks update status and error code idempotently.

The existing daily financial cron fetches unresolved Message resources using the tenant subaccount credential from Vault. Usage is finalized only after a terminal status, positive segment count, media count, price, and price currency are available. Missing prices are retried with bounded backoff.

Plan configuration lives in `messaging_usage_plan_configs`. A plan may be matched by the Servonas subscription Stripe Price ID. The `default` plan is the fallback and starts with zero included segments until configured by a platform operator. Customer billable usage counts finalized outbound SMS segments. Provider cost is retained and totaled separately.

`business_messaging_billing_periods` stores idempotent monthly calculations. A closed month is finalized only when it has no unresolved messages. Stripe billing remains intentionally disabled.

Read-only platform-admin report:

`GET /api/admin/twilio/usage/{businessId}?period=2026-08`
