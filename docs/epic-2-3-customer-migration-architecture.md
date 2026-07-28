# Epic 2.3 — Customer Migration Architecture and UX Plan

Status: implementation-ready design  
Date: 2026-07-28

This document is the required discovery, migration-experience design, and
technical plan for Epic 2.3. Product implementation starts only after these
decisions are coherent.

## Repository findings

### Relevant application files

- `app/app/[businessSlug]/customers/page.tsx` — customer list, filters, counts,
  and manual-create entry point.
- `app/app/[businessSlug]/customers/actions.ts` — authorized customer and
  service-location writes, duplicate warnings, and address geocoding.
- `app/app/[businessSlug]/customers/new/page.tsx` and
  `app/app/[businessSlug]/customers/[customerId]/**` — existing customer and
  location forms that imports must not replace.
- `app/app/[businessSlug]/team/imports/**` — Epic 2.2’s resumable import,
  mapping, validation, review, commit, retry, history, rollback, and onboarding
  patterns.
- `lib/employeeImport/file.ts` — safe CSV/XLSX parsing conventions.
- `lib/employeeImport/mapping.ts`, `validation.ts`, `duplicates.ts`,
  `review.ts`, and `lifecycle.ts` — reusable concepts whose generic portions
  should move to `lib/imports`, without changing employee-import behavior.
- `lib/workspace.ts` — active-entitlement and tenant access enforcement.
- `lib/access.ts` — centralized workspace-role decisions.
- `lib/geocoding/**` and the existing Google address helpers — provider-neutral
  address resolution and Google parsing.
- `app/api/cron/**` — the existing secret-protected worker route convention.
- `supabase/epic_3_core_platform.sql` — customers, activity, and tenant
  constraints.
- `supabase/migrations/20260723000100_epic_5_checkpoint_1_foundation.sql` —
  current customer and service-location fields.
- `supabase/migrations/20260724001100_epic_7_checkpoint_3_address_intelligence.sql`
  — address-resolution state.
- `supabase/migrations/20260725000500_epic_7_checkpoint_15_service_routing_readiness.sql`
  — recurring-service series.
- `supabase/migrations/20260727001700_epic_2_2_checkpoint_3_import_upload.sql`
  through `20260727002900_epic_2_2_checkpoint_19_onboarding_integration.sql` —
  the existing import architecture and operational conventions.

### Existing domain model

- A business is the tenant. All imported and destination records carry
  `business_id`; composite tenant foreign keys are used where available.
- Active `business_entitlements`, not Stripe or subscription state, grant
  workspace access.
- A customer has one compatibility-level primary name, email, and phone on the
  `customers` row. It also supports company name, secondary phone, contact
  preference, tags, lead source, active/inactive state, notes, audit fields,
  and soft deletion.
- A customer can have multiple `service_locations`. A location contains the
  structured service address, provider/place data, coordinates, operational
  access notes, active state, and primary designation. The database prevents
  multiple active primary locations for one customer.
- There is no first-class additional-contact table today.
- There is no first-class billing/mailing-address table today. A service
  location must remain an operational service address and must not be
  overloaded as a billing address.
- There is no durable, source-scoped external-customer-ID model today.
- `recurring_service_series` belongs to a customer and service location, with
  an optional service. It supports day/week/month/year intervals, next due
  date, preferred window, routing requirements, and active state. Importing a
  series does not create jobs.
- Customer notes are currently a field on `customers`; structured property
  notes live on `service_locations`. There is no customer-note event domain.
- Business activity exists, but import audit events need their own safe,
  queryable lifecycle and must not put customer PII into log metadata.
- Files use private Supabase Storage conventions. No general-purpose queue
  framework exists; cron-backed database work claiming is the repository’s
  smallest compatible background-processing pattern.

### Compatibility constraints

- Existing customer screens read the primary contact projection directly from
  `customers`; it must continue to work.
- Existing service-location IDs and rows remain authoritative and are never
  replaced by an import-only address model.
- Existing unique customer-email behavior must be respected during duplicate
  review and commit.
- Existing geocoding may be unavailable. Geocoding cannot block uploading,
  mapping, validation, or importing an otherwise structurally valid address.
- Existing customer and location rows must never be silently overwritten.
- Import access cannot depend on billing configuration.

## Migration journey

The route family will be
`/app/[businessSlug]/customers/imports`. Every step reads the persisted session;
the URL may identify the session and stage, but the URL is not lifecycle state.

### 1. Landing

Show customer count, service-location count, incomplete migration, recent
imports, failed-record count, manual customer link, template, and guidance.
The empty state explains Upload → Review → Import and states that nothing is
written before confirmation.

States:

- Loading: compact count and history skeletons.
- No imports: three-step explanation and two clear actions.
- Resume: the most recent active session is prominent, with last activity.
- Failure: history remains available and a new import can still begin.

### 2. Migration type

Offer customer list, customer plus locations, customer plus recurring service,
and custom spreadsheet in plain language. After file inspection, Servonas can
recommend a type with reasons, but the user confirms it.

### 3. Upload and worksheet selection

Drag/drop and file picker accept CSV and XLSX. The parser reports all workbook
worksheets, including hidden state and meaningful row count. Hidden worksheets
are opt-in. The user selects exactly one worksheet. No sheets are combined.

The UI discloses file/row limits, 30-day source-file retention, private storage,
and that formulas/macros are not executed. It distinguishes empty, malformed,
encrypted, macro-enabled, suspicious archive, encoding, header, size, and
column-limit failures.

### 4. Mapping

A table presents source header, representative values, suggested destination,
confidence, expected type, and required/optional state. Users can ignore,
remap, combine name/address inputs, and split supported combined fields.
Mapping is saved immediately. A mapping profile is suggested only when its
header fingerprint is sufficiently close; it is never silently applied.

### 5. Grouping preview

The user sees proposed customer cards containing contacts, service locations,
billing addresses, and recurring services. Row provenance remains visible.
They can split a mistaken group, combine clear matches, choose a primary
contact, and select the primary service location.

Wireframe:

```text
Acme Property Management                       4 source rows
  Primary: Dana Ortiz · dana@example.com
  Contacts (2)     Service locations (3)     Recurring services (5)
  [Inspect source rows] [Split group] [Change primary]
```

### 6. Validation and cleanup

Issues are grouped as blocking errors, review warnings, and informational
normalizations. Users can edit a cell, apply a safe bulk correction, filter by
issue, or skip an entity. Corrections persist independently of the raw source.
The original value is always inspectable.

### 7. Address review

Billing and service addresses are labeled separately. Structurally valid
addresses can proceed without coordinates. When provider configuration exists,
the user can accept a provider suggestion, keep the original, or edit it.
Apartment/unit values are never dropped during normalization.

### 8. Duplicate review and update decisions

Definite and possible matches are separate queues. The UI shows source and
existing values side by side and explains why each match was suggested.
Decisions are create, link/add location, update selected fields, skip, or merge
only where the operation is reversible and explicit.

Blank incoming values default to “keep existing.” Every writable field has a
per-field decision. No bulk “overwrite everything” action is offered.

### 9. Recurring-service review

Service names are linked to existing services or explicitly left unresolved.
Frequency, interval, price context, next date, route/territory label, and
location are reviewed. Ambiguous labels such as “bimonthly” always require a
choice. No future jobs are generated by this epic.

### 10. Final review

Show exact totals for new/updated/skipped customers, contacts, service
locations, billing addresses, recurring series, warnings, invalid entities,
and unresolved duplicates. The confirmation states whether valid-only import
is selected. Import remains disabled for unresolved blocking decisions.

### 11. Processing and results

Commit is queued and progress survives navigation. Results distinguish
completed, completed with errors, failed, and canceled. Successful entity
receipts are immutable and drive retry idempotency. Failed entities remain
editable and retryable.

### 12. History, rollback, and onboarding handoff

History shows who, when, source filename, counts, status, warnings, failures,
and rollback eligibility. Rollback first previews deletable and protected
records. Completed imports return the onboarding user to scheduling/go-live;
no billing prompt appears.

## Grouping and identity rules

### Customer grouping

Signals are evaluated in order, with explicit source identity taking
precedence:

1. Same nonblank explicit customer/grouping key in the source.
2. Same normalized source-system external customer ID or account number.
3. Same normalized email plus compatible customer/company name.
4. Same normalized phone plus compatible customer/company name.
5. Same exact normalized company/name plus the same normalized billing address.

Last name alone, street alone, or fuzzy name alone never groups customers.
Conflicting strong identifiers create a review warning instead of an automatic
group.

### Location grouping

A location belongs to the proposed customer group. It groups by explicit
location external ID first, then a structured-address fingerprint:

`street + unit + city + region + postal code + country`.

Normalization ignores harmless case, punctuation, and whitespace differences,
but unit/suite differences remain distinct. Missing unit data cannot overwrite
an existing unit. Similar addresses are surfaced for review rather than
collapsed.

### Contact grouping

Within one customer group, identical normalized email is the strongest key,
then identical normalized phone. Name alone only produces a possible-match
warning. The user selects one primary contact. Additional contacts are stored
in a first-class contact relation; compatibility triggers/projectors keep the
selected primary values on `customers`.

## Duplicate scoring

Scoring creates explainable candidates; it never writes data:

- +100 same source-system external customer ID
- +90 same account number when the profile defines it as tenant-unique
- +70 exact normalized email
- +60 exact normalized phone
- +35 exact normalized company/customer name
- +25 exact normalized billing-address fingerprint
- +20 exact normalized service-location fingerprint
- −80 conflicting nonblank external IDs
- −50 conflicting exact emails attached to incompatible names

Suggested bands:

- 100 or more: definite, but user confirmation is still required for updates.
- 70–99: strong possible duplicate.
- 45–69: possible duplicate requiring review.
- below 45: no candidate unless manually linked.

Every candidate stores signal codes and values’ hashes, not raw PII in audit
metadata.

## Update and merge rules

- Create is the default when no existing record is explicitly selected.
- Link/add-location writes no customer fields unless selected separately.
- Update is a field-level patch. Blank, whitespace-only, or unparsable incoming
  values never erase a populated destination by default.
- Changing primary email must pass tenant uniqueness and duplicate review.
- Existing notes append with a dated/source label; replacement requires an
  explicit choice.
- Tags union by default; replacement is not offered in the initial release.
- Location operational notes update independently of address fields.
- Recurring series update only when linked explicitly by external reference or
  by a reviewed exact customer/location/service/cadence match.
- “Merge customers” is not a destructive general CRM merge. In this epic it
  means attach imported entities to one reviewed existing customer and apply
  selected patches. Existing Servonas customers are never combined or deleted.

## Lifecycle

### Import session

```text
uploaded
  → mapping
  → analyzing
  → validating
  → needs_review ↔ validating
  → ready
  → queued
  → importing
  → completed | completed_with_errors | failed

uploaded/mapping/analyzing/validating/needs_review/ready → canceled
completed/completed_with_errors → rollback_pending → rolled_back | rollback_partial
failed → queued (retry only failed/uncommitted entities)
```

Transitions occur through database functions using optimistic `version`
checks. Processing workers claim a session with a lease so abandoned work can
be recovered.

### Row and entity lifecycle

Raw rows are immutable after parsing. Derived entities have:
`draft → valid|warning|invalid|duplicate → ready|skipped → importing →
imported|updated|failed|rolled_back|protected`.

Corrections, grouping changes, and duplicate decisions are separate versioned
records. Successful commit receipts are never reset during retry.

## Proposed schema

The migration sequence will create:

- `customer_imports` — typed lifecycle, counts, source metadata, selected
  worksheet, settings, version, lease, retention, and rollback state.
- `customer_import_rows` — immutable tenant-scoped raw cells and parse state.
- `customer_import_entities` — normalized customer/contact/location/address/
  recurring/note/attachment-placeholder records with source-row provenance.
- `customer_import_mappings` and `customer_import_mapping_profiles`.
- `customer_import_corrections`, `customer_import_issues`,
  `customer_import_duplicate_candidates`, and
  `customer_import_duplicate_decisions`.
- `customer_import_commit_receipts` — unique idempotency key per import entity,
  operation, and version; records destination IDs and before/after patch facts.
- `customer_import_events` — safe lifecycle audit.
- `customer_contacts` — additional contacts, with one active primary per
  customer and tenant-safe foreign keys.
- `customer_addresses` — billing/mailing addresses only. Operational service
  addresses continue to use `service_locations`.
- `customer_external_references` — unique
  `(business_id, source_system, entity_type, external_id)` mappings for
  customers, locations, contacts, and recurring services.
- `customer_import_attachment_placeholders` — source metadata only; no file
  migration.

Typed columns hold status, counts, tenant, ownership, destination IDs, stage,
versions, timestamps, and worker state. JSONB holds provider-neutral normalized
payloads, source cells, transform configuration, and noncritical metadata.

All tables use RLS and tenant-scoped composite foreign keys. Destination
references are validated to the import’s business. Import management is
available to owner/admin/manager roles with customer-management access;
rollback and raw-file deletion require owner/admin.

## Shared import platform

Epic 2.2 remains functional. Reusable, domain-neutral behavior will be extracted
without changing its tables:

- CSV decoding and RFC-style parsing
- workbook safety inspection and worksheet inventory
- header validation and source-column samples
- mapping confidence representation and header fingerprints
- lifecycle/version helpers
- progress and issue presentation primitives
- private file-retention helpers
- CSV formula-injection-safe export

Employee-specific aliases, limits, employee validation, invitation behavior,
commit tables, and rollback rules remain employee-specific. Customer imports
use a separate domain pipeline rather than forcing customer entities into
employee-import rows.

## Background processing and idempotency

- Upload parsing may complete in-request only within a small, documented budget.
  Analysis and commit are always resumable database jobs.
- A `CRON_SECRET`-protected worker route claims jobs with a database function,
  a lease expiration, attempt count, and stable idempotency key.
- Batch size is bounded. Each committed entity has a unique receipt before the
  destination write is considered complete.
- Retry selects only failed or uncommitted entity keys. Successful receipts
  make repeated requests no-ops.
- A session cannot have two active workers for the same stage/version.
- Status, progress, heartbeat, attempts, category-safe failure code, and
  duration are queryable. Logs contain IDs and counts, never raw customer data.

Initial documented limits:

- CSV/XLSX only; macro-enabled and legacy XLS files rejected.
- 25 MB compressed upload.
- 25,000 data rows.
- 150 columns.
- 5,000 characters per cell.
- suspicious XLSX compressed/uncompressed ratio and total-entry limits enforced.
- source file and raw rows retained 30 days after terminal state by default.
- audit events and commit receipts retained independently.

## Recurrence transformation

Supported normalized values:

- weekly → week / 1
- every N weeks → week / N
- monthly → month / 1
- quarterly → month / 3
- annually/yearly → year / 1
- daily/every N days → day / N

“Biweekly” suggests week / 2. “Semi-monthly,” “twice monthly,” and
“bimonthly” require review because their intent is ambiguous. Unsupported
frequencies can be preserved as a warning and skipped without blocking the
customer/location import. Price is retained as import context until it can map
to a supported recurring-series field; it does not fabricate job or invoice
amounts.

## Security and privacy

- Every server entry point calls `requireWorkspace` and checks role capability.
- Active entitlement is required; billing state is never queried.
- Raw files are stored in a tenant-private bucket path and accessed with
  short-lived signed URLs only by authorized users.
- Spreadsheet formulas and macros are never executed. Formula cells are
  rejected or imported as displayed values only under an explicit safe parser
  policy.
- CSV exports prefix formula-leading cells to prevent spreadsheet execution.
- Notes receive sensitive-data warnings for payment-card-like or credential-like
  content; no secrets are copied to logs or analytics.
- Audit metadata contains actor, tenant, import, entity IDs, counts, decision
  types, signal codes, and hashes—not names, emails, phones, addresses, or note
  text.
- Service-role worker operations accept an import ID, derive the tenant from
  the claimed row, and invoke narrow database functions. They do not trust a
  caller-supplied business ID.
- RLS integration tests must run against a real database for cross-tenant
  imports, rows, decisions, destination references, worker claims, and rollback.

## Backward compatibility and rollout

- Schema additions are additive; existing customers and locations are not
  backfilled into new import tables.
- Existing primary contact columns remain readable and writable. New
  contact-management functions synchronize the selected primary contact
  atomically to those columns.
- Billing addresses are additive and are not exposed as service locations.
- External references are optional and never change existing customer IDs.
- Recurring imports use the current `recurring_service_series` domain.
- New navigation is entitlement- and role-aware but has no billing gate.
- Migrations are installed before routes are exposed. Missing-schema errors
  produce a specific operational message rather than a generic failure.
- Launch starts with pilot tenants, worker concurrency and row limits kept
  conservative, and monitoring on failures, retries, queue age, duration, and
  row throughput.

## File-by-file implementation plan

### Shared foundation

- Add `lib/imports/file.ts`, `lifecycle.ts`, `mapping.ts`, `security.ts`, and
  shared presentation types extracted compatibly from Epic 2.2.
- Keep adapters in `lib/employeeImport/**` so existing imports and tests do not
  change behavior.
- Add shared import progress, issue summary, and mapping-table components under
  `app/app/[businessSlug]/imports/_components`.

### Customer pipeline

- Add `lib/customerImport/types.ts`, `file.ts`, `mapping.ts`, `normalize.ts`,
  `grouping.ts`, `validation.ts`, `addresses.ts`, `duplicates.ts`,
  `recurrence.ts`, `commit.ts`, `retry.ts`, and `rollback.ts`.
- Add customer import pages/actions/components under
  `app/app/[businessSlug]/customers/imports/**`.
- Add a private template endpoint and customer CSV/XLSX template assets.
- Add `app/api/cron/customer-imports/route.ts` for bounded claim/process calls.
- Add timestamped Supabase migrations checkpoint-by-checkpoint under
  `supabase/migrations`; never keep duplicate executable SQL copies.

### Tests

- Unit tests: parsing, worksheet inventory, aliases, transformations,
  grouping, address fingerprints, duplicate scoring, blank-safe patches,
  recurrence, CSV export safety, lifecycle, and idempotency.
- Database integration: RLS, composite tenant references, worker claims,
  duplicate receipts, partial failure, retry, rollback protection, and
  concurrent commit attempts.
- Route/action tests: entitlement without billing, roles, schema errors,
  validation, resume, and background status.
- Browser/manual tests: all required CSV/XLSX, multi-sheet, multi-location,
  duplicate, update, partial success, retry, refresh, responsive, and
  onboarding scenarios.

## Risks and mitigations

- **False customer grouping:** conservative strong-signal rules and mandatory
  preview/split tools.
- **Incorrect overwrite:** field-level decisions and blank-safe patches.
- **Duplicate retry writes:** immutable commit receipts and destination external
  references.
- **Large workbook memory/timeout:** archive guards, hard limits, persisted
  jobs, bounded batches, and leases.
- **Geocoding cost/outage:** deferred resolution, rate limits, and structurally
  valid import without coordinates.
- **Primary-contact drift:** one centralized synchronization operation.
- **Rollback deleting later work:** receipts plus dependency/change checks mark
  records protected instead of deleting them.
- **PII leakage:** private storage, narrow service role, safe audit metadata,
  retention, and formula-safe exports.
- **Ambiguous recurrence:** require explicit review and allow customer import
  without the recurrence.

## Definition of architecture readiness

The experience is coherent because the user can always see what stage they are
in, nothing is committed before review, grouping and duplicate reasons are
explainable, corrections persist, partial success is recoverable, retries are
idempotent, and rollback cannot silently remove later operational work.

Checkpoint implementation may now begin with the landing page and template,
followed by upload/worksheet selection and the persistent session foundation.
