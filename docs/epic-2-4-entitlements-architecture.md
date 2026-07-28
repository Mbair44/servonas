# Epic 2.4 — Entitlements and Billing Readiness Architecture

Status: implementation-ready discovery and design  
Date: 2026-07-28

## Findings

### Relevant files

- `lib/workspace.ts` is the current workspace authority. It authenticates,
  resolves platform administrators and membership, then requires any active,
  date-valid `business_entitlements` row before returning.
- `lib/access.ts` and domain permission helpers implement user-role
  authorization. These remain separate from tenant entitlement.
- `lib/platformAccess.ts` recognizes confirmed `@servonas.com` accounts as
  internal platform administrators.
- `app/onboarding/actions.ts` invokes transactional database workspace-creation
  functions.
- `supabase/migrations/20260727001000_epic_2_1_checkpoint_1_onboarding_foundation.sql`
  introduced `business_entitlements`, entitlement audit events, initial tenant
  backfill, and transactional pilot provisioning.
- `supabase/migrations/20260727001100_epic_2_1_checkpoint_2_company_onboarding.sql`
  provisions pilot access in the current guided creation function.
- `app/onboarding/page.tsx` and
  `20260727001500_epic_2_1_checkpoint_6_readiness_review.sql` directly check the
  literal `pilot` code and active dates.
- `app/app/[businessSlug]/team/imports/**` and
  `customers/imports/**` rely on `requireWorkspace` plus role checks; they do
  not yet assert domain capabilities.
- `app/app/[businessSlug]/settings/page.tsx` has no Plan & Access section.
- `app/admin/page.tsx` is a legacy service-role booking dashboard and does not
  authenticate a platform administrator itself. It is not a safe entitlement
  administration surface.
- `app/app/page.tsx` already provides confirmed platform administrators with
  all workspace links using the service-role client.
- `middleware.ts` checks authentication only. It does not and should not make
  entitlement decisions.
- `lib/stripeConnect.ts`, Stripe API routes, payment accounts, public invoice
  checkout, and payment webhooks support a tenant’s ability to collect money.
  They do not currently authorize product modules and must stay separate.
- `vercel.json` contains once-daily communication and financial jobs. No cron is
  needed for entitlement correctness.

### Current access architecture

```text
authenticated user
  → resolve business
  → platform admin OR currently active entitlement required
  → resolve membership/role
  → page/action performs role check
```

This is fail-closed and tenant-scoped, but too coarse:

- inactive tenants cannot enter the workspace to view preserved data or their
  access status;
- all capabilities are implicitly identical;
- callers cannot distinguish missing, expired, suspended, or excluded access;
- literal pilot checks exist outside one evaluator;
- there is no limit interface;
- there is no safe internal lifecycle command surface.

### Billing and plan assumptions

- No Stripe subscription authorizes a Servonas module.
- Stripe Connect determines whether customer invoice payments can be collected.
- The public pricing page contains launch-positioning prices and clearly states
  that payment is not collected. It is marketing content, not authorization.
- Legacy `business_model`, enabled modules, payment-account state, invoice
  status, and customer active state have meanings unrelated to entitlement and
  must not be mechanically replaced.
- Existing `business_entitlements` uses codes as free text, statuses
  `active/inactive/expired`, sources `pilot/subscription/manual`, and a unique
  `(business_id, entitlement_key)` constraint. It lacks versioning, lifecycle
  timestamps, grace period, suspension facts, supersession, and a database
  guarantee against overlapping primary access.

## Domain design

### Separation

```text
future billing provider
  → billing synchronization boundary
  → validated entitlement command
  → tenant entitlement
  → capability evaluator
  → product access

user membership/role
  → permission evaluator
  ───────────────────────┘ both required for protected mutations
```

Stripe will never be queried by the entitlement evaluator.

### Entitlement record

`business_entitlements` remains the source-of-truth table and is evolved
additively:

- code: `pilot | starter | growth | business | enterprise`
- status: `scheduled | active | grace_period | expired | suspended | canceled |
  superseded`
- source: `pilot | manual | billing_sync | migration | system`
- start, end, optional grace-period end
- lifecycle actor/timestamp/reason facts
- version for optimistic concurrency
- optional superseding entitlement reference
- JSON metadata for noncritical correlation facts

The existing `entitlement_key` column remains the physical code for
compatibility. Existing `inactive` rows are migrated conservatively to
`suspended`, with an audit event noting the legacy mapping.

One partial unique index permits only one primary row in
`active`, `grace_period`, or `scheduled` state per business. Lifecycle commands
lock the tenant’s rows and use an expected version. Historical rows are never
rewritten into a different commercial plan.

Pilot policy is indefinite unless an authorized internal administrator
explicitly assigns `ends_at`.

### Catalog and capabilities

The catalog is code-owned and server-importable, not duplicated in components:

- `pilot` grants all currently released capabilities and has billing disabled.
- paid codes exist as future-ready definitions but are not publicly selectable,
  billing-enabled, or connected to checkout.

Capability codes reuse current product terminology:

`business_onboarding`, `team_management`, `employee_import`,
`employee_invitations`, `customer_management`, `customer_migration`,
`schedule_management`, `dispatch`, `job_management`, `territory_management`,
`estimates`, `invoices`, `online_booking`, `reporting`, `inventory`,
`advanced_workforce_intelligence`, and `scenario_planning`.

No arbitrary pilot usage limits are enforced. The catalog exposes a stable
limit API with `null` meaning unlimited.

### Date and current-entitlement evaluation

Evaluation is request-time and UTC-based:

1. Load tenant-scoped candidate rows, newest first.
2. Suspended/canceled/superseded rows are inactive regardless of dates.
3. A row whose `starts_at` is in the future evaluates as scheduled.
4. An active row past `ends_at` evaluates as grace period only while
   `grace_period_ends_at` is future; otherwise expired.
5. Stored `active` does not override an elapsed end date.
6. Stored `scheduled` may evaluate active once its start arrives.
7. Return the effective primary candidate and a structured reason.

No daily reconciliation is required for correctness. A future daily job may
normalize stored reporting status, but access never waits for it.

### Structured access result

```ts
type CapabilityAccessResult = {
  allowed: boolean;
  capability: CapabilityCode;
  entitlementCode: EntitlementCode | null;
  entitlementStatus: EffectiveEntitlementStatus | null;
  reason:
    | "allowed"
    | "no_entitlement"
    | "scheduled"
    | "expired"
    | "suspended"
    | "canceled"
    | "capability_not_included"
    | "limit_reached"
    | "evaluation_failed";
  limit: number | null;
  currentUsage: number | null;
};
```

`lib/entitlements/service.ts` will provide:

- `getCurrentEntitlement`
- `getEntitlementSummary`
- `getCapabilityAccess`
- `canAccess`
- `assertCanAccess`
- `getTenantLimits`
- `getUsage`
- `canConsume`

It accepts a server Supabase client and a known business ID. It does not trust
client-provided entitlement codes. No cache is introduced initially; this
avoids stale suspension privileges and cross-tenant cache risk.

## Lifecycle

Allowed transitions:

```text
scheduled → active | canceled | superseded
active → grace_period | suspended | canceled | superseded
grace_period → active | expired | suspended | canceled | superseded
suspended → active | canceled | superseded
expired → active | superseded
canceled → superseded
```

An end-date extension may make an effectively expired row active through a
dedicated restore/extend command. Sensitive operations require platform-admin
authorization, confirmation, expected version, and a useful reason.

Tenant users can read their own current entitlement and audit-safe history.
They cannot insert, update, delete, or invoke lifecycle commands.

## Inactive-access policy

`requireWorkspace` will become identity/membership resolution plus entitlement
summary. It will no longer redirect merely because access is inactive.

- Reads remain available through existing RLS and workspace pages.
- Settings → Plan & Access remains visible.
- A tenant-wide banner explains scheduled, expired, suspended, canceled, or
  missing access without exposing internal reasons.
- Every protected server mutation calls `assertCanAccess` before its existing
  role check or database write.
- Data, users, imports, onboarding state, and settings are preserved.
- Platform administrators retain audited operational access.

The initial migration prioritizes high-risk write entry points: onboarding,
employee import/invitations, customer migration, customers, jobs, schedule,
dispatch, territories/scenarios, estimates, invoices, team management, booking
settings, and price-book changes. Navigation may remain visible for read-only
inspection; hiding is not used as security.

## Provisioning and backfill

All supported workspace creation functions remain transactional and will call
one database helper, `ensure_pilot_entitlement(business_id, actor, source)`.
The helper is idempotent, tenant-locked, creates the audit event, and returns
the effective row. No Stripe or payment record participates.

Backfill is a forward migration plus explicit operator report:

- eligible businesses with no entitlement receive active pilot;
- businesses with any current/history entitlement are not overwritten;
- existing pilot rows are evolved in place;
- ambiguous legacy codes/statuses appear in a dry-run audit;
- repeated execution creates no duplicates;
- audit events mark `existing_tenant_backfilled`;
- rollback cancels only rows whose metadata identifies this backfill and that
  have not since been changed, rather than deleting history.

## Internal administration

The legacy `/admin` page is not suitable because it lacks its own platform-user
authorization boundary. The smallest safe interface is a new
`/app/admin/entitlements` route:

- requires a confirmed `@servonas.com` user before obtaining service-role data;
- lists tenant, current access, effective status/dates, and history;
- invokes narrow security-definer lifecycle functions;
- requires expected version, reason, and confirmation;
- logs tenant, entitlement, actor, old/new state, source, timestamps, and a
  correlation ID without tenant/user PII in metadata.

Platform admins may inspect tenant workspaces, but tenant-scoped entitlement
commands remain narrow and audited rather than generic service-role updates.

## Feature flags

Entitlements answer whether a tenant is commercially/operationally eligible.
Feature flags answer whether code is released for a cohort. Existing enabled
modules and rollout decisions remain separate. A future feature-flag evaluator
may be checked before entitlement, but release state is not stored in
entitlement rows.

## Future Stripe boundary

Future webhook/checkout code will:

1. authenticate and deduplicate the provider event;
2. map an internally configured price to a commercial decision;
3. call a narrow entitlement command such as activate, replace, schedule, or
   suspend;
4. record provider synchronization separately.

It will not scatter Stripe-status checks across product routes. Pilot rows need
no Stripe customer, subscription, price, or payment method. No billing domain
placeholder is added until actual Stripe Billing work begins.

## Schema and migration plan

1. Add catalog-compatible lifecycle fields, constraints, effective-date
   indexes, concurrency version, and immutable audit fields.
2. Migrate known legacy statuses/sources and add the one-primary-row index.
3. Add lifecycle/evaluation database helpers and idempotent pilot provisioning.
4. Backfill only businesses with no entitlement and produce a documented audit.
5. Replace workspace-creation functions so pilot provisioning remains in the
   same transaction.
6. Add tenant read RLS and platform-admin-only command authorization.
7. Do not remove legacy billing, Stripe Connect, plan, or enabled-module fields.

## File-by-file implementation plan

- `lib/entitlements/catalog.ts` — codes, capabilities, labels, limits.
- `lib/entitlements/evaluate.ts` — deterministic date/status/transition logic.
- `lib/entitlements/service.ts` — authoritative server query and assertion API.
- `lib/entitlements/errors.ts` — structured friendly access denial.
- `lib/workspace.ts` — return entitlement context without blocking reads.
- `app/app/[businessSlug]/EntitlementBanner.tsx` and workspace layout/nav
  integration — inactive messaging.
- `app/app/[businessSlug]/settings/page.tsx` — Plan & Access view.
- `app/app/admin/entitlements/**` — internal history and lifecycle commands.
- Existing domain action files — add capability assertions while retaining role
  checks.
- Onboarding pages/actions and completion RPC — replace literal pilot checks.
- Employee/customer import actions and customer-import worker — recheck their
  capability server-side.
- Timestamped Supabase migrations — forward-only model, commands, provisioning,
  and backfill.
- `supabase/audits/epic_2_4_entitlement_backfill_audit.sql` — dry run,
  ambiguity report, post-run verification, and safe validation commands.
- `docs/epic-2-4-entitlement-operations.md` — grant, suspend, restore, extend,
  diagnose, backfill, and future Stripe boundary.
- `tests/entitlements.test.ts` plus database integration SQL — date evaluation,
  transitions, catalog, structured denial, idempotency, and tenant isolation.

## Risks and compatibility

- **Inactive tenants currently lose all workspace access.** Change the workspace
  resolver before enforcing capability assertions so reads and Plan & Access
  remain reachable.
- **Many mutation entry points exist.** Migrate by domain and retain role checks;
  a repository search report will document intentionally billing-specific or
  feature-release checks.
- **Existing rows use legacy statuses.** Migrate deterministically and report
  unknown values before adding strict constraints.
- **Duplicate active rows may already exist.** Audit and repair before creating
  the partial unique index; do not arbitrarily choose when dates conflict.
- **Platform-admin email convention is powerful.** Admin pages must verify the
  authenticated confirmed user before creating a service-role client.
- **Direct database RPCs can bypass Next.js assertions.** Protected RPCs must
  also evaluate entitlement or be callable only through narrow
  security-definer commands.
- **Payment code contains Stripe checks.** These are provider readiness checks,
  not product authorization, and remain intact.
- **No cache initially.** Database lookup cost is preferable to stale access;
  optimize only with versioned tenant-scoped cache evidence.
- **No cron.** Effective dates are evaluated at request time, avoiding Hobby
  scheduling limitations.

## Definition of foundation readiness

The design is coherent when product access is a capability result derived from
one effective tenant entitlement, user permission remains independent, inactive
tenants retain safe reads, provisioning is transactional and idempotent, all
lifecycle changes are narrow and audited, and future billing can issue
entitlement commands without becoming authorization.

That threshold is met by this design. Foundation implementation may begin.
