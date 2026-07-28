# Epic 2.4 entitlement operations

## Source of truth

`business_entitlements` answers what a tenant may use. The code-owned catalog
maps an entitlement code to capabilities and optional limits. User roles still
answer what an individual may do. Both checks are required for protected
mutations.

Stripe Connect remains a payment-collection integration. It does not grant
product access. Pilot tenants require no Stripe customer, subscription, card,
or payment method.

## Provisioning

Workspace creation inserts the owner membership, onboarding state, and active
pilot entitlement in the same database transaction. `ensure_pilot_entitlement`
uses a tenant advisory lock and returns an existing primary entitlement on
retry. Core provisioning never depends on cron.

Pilot access is indefinite unless an internal administrator assigns an end
date. Dates are interpreted at request time, so expiration and scheduled access
remain correct even if no reconciliation job runs.

## Backfill

Run `supabase/audits/epic_2_4_entitlement_backfill_audit.sql` before the
foundation migration. Resolve unknown codes, unknown statuses, and overlapping
primary rows before validating constraints. The backfill inserts Pilot only for
businesses with no entitlement history and writes one
`existing_tenant_backfilled` event. Re-running it is idempotent.

Rollback never deletes tenant data. If a backfilled entitlement must be
reversed, use the internal cancellation command with a reason; preserve the
entitlement and audit rows.

## Internal administration

Confirmed `@servonas.com` users can open `/app/admin/entitlements`.

- Grant Pilot to a tenant with no entitlement.
- Suspend active access immediately.
- Restore suspended or effectively expired access.
- Cancel current access.
- Extend, shorten, or remove an end date.

Every action requires `CONFIRM`, a useful reason, the current row version, and
the narrow `manage_business_entitlement` or
`grant_pilot_entitlement_admin` database command. Commands tenant-lock rows,
reject stale versions and invalid transitions, and write immutable audit
events. Tenant users cannot invoke these commands successfully.

## Inactive access

Members may sign in and read existing tenant data. Protected writes call
`requireWorkspaceCapability` and redirect to Settings → Plan & Access with a
customer-friendly explanation. Data, users, imports, customers, jobs, and
settings are not deleted. Platform administrators retain explicit operational
access.

If access cannot be evaluated, mutations fail closed. No entitlement results
are cached, avoiding stale suspension privileges and cross-tenant cache keys.

## Diagnosis

1. Inspect Settings → Plan & Access for effective status and dates.
2. Internal administrators inspect `/app/admin/entitlements` and audit history.
3. Run the audit SQL to identify missing, unknown, or overlapping rows.
4. Confirm all Epic 2.4 migrations were applied in timestamp order.
5. Search server logs for `Entitlement evaluation query failed`,
   `Entitlement capability access denied`, or lifecycle command error codes.

Logs and analytics contain tenant IDs, entitlement codes, capabilities, and
structured reasons only. They do not contain customer information, payment
data, authentication tokens, or administrative reason text.

## Future Stripe Billing boundary

Future billing synchronization must authenticate and deduplicate provider
events, map configured prices to an internal commercial decision, then call a
narrow entitlement command. Billing code may request activation, replacement,
scheduling, suspension, or cancellation; it must not update product checks
throughout the application.

Webhook idempotency belongs to the future billing synchronization layer.
External customer, price, and subscription identifiers remain billing-domain
data and are optional for Pilot. Stripe status must never be queried by the
entitlement evaluator.

## No maintenance cron

Epic 2.4 adds no cron. Request-time date evaluation is authoritative. A future
once-daily reconciliation may normalize reporting status, but it must be
idempotent, verify `CRON_SECRET`, and never be required for access correctness.
