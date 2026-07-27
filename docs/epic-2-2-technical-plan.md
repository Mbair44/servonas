# Epic 2.2 — Technical Plan

This plan follows the domain and UX decisions in
`docs/epic-2-2-discovery-ux-plan.md`. It intentionally introduces no
executable migration or product behavior.

## Architecture decisions

1. `employees` remains the workforce source of truth.
2. `business_members` remains the authenticated tenant-access source of truth.
3. `workforce_roles` describes work; `business_members.role` describes
   application access.
4. `business_invitations` is extended rather than replaced.
5. Import sessions are persistent and tenant-owned.
6. The browser may request transitions but cannot write lifecycle states,
   counts, tenant IDs, or result IDs directly.
7. Active Servonas entitlement is evaluated centrally. No Stripe field is
   queried.
8. Owner access cannot be granted or transferred by an import.
9. Initial processing uses bounded server-side batches and a protected worker
   endpoint because the repository has no general queue.
10. Original files and raw rows expire; audit summaries remain.

## Ordered migration plan

Migrations must be timestamped, independently auditable, and tested in a clean
database in this order.

### Migration 1 — Import foundation

Create `employee_imports`:

- `id uuid`
- `business_id uuid`
- `import_type text` constrained to `employee`
- `file_name text`
- `file_extension text` constrained to `csv|xlsx`
- `file_size_bytes bigint`
- `file_checksum text`
- `storage_path text`
- `status text`
- `current_stage text`
- typed row/result counts
- `settings jsonb` constrained to object
- `source_columns jsonb` constrained to array
- `uploaded_by uuid`
- lifecycle timestamps
- `raw_data_expires_at timestamptz`
- `source_deleted_at timestamptz`
- `version integer`
- `request_key uuid`

Important constraints:

- unique `(business_id,id)`
- unique `(business_id,request_key)`
- unique active checksum only where reuse behavior is safe
- nonnegative counts
- imported + updated + skipped + failed cannot exceed total
- terminal-state timestamps agree with status
- storage paths begin with `business_id/import_id/`

Create `employee_import_column_mappings`:

- tenant/import composite FK
- source index/name
- destination field constrained to the supported field registry
- transformation constrained to supported transformations
- confidence and ignored flag
- unique source column per import
- partial unique destination per import when not ignored, except approved
  combination targets such as full name

Create `employee_import_rows`:

- tenant/import composite FK
- source row number
- `raw_values` and `normalized_values` object JSON
- validation, duplicate, resolution, invitation, and import statuses as typed
  columns
- existing and created employee composite tenant FKs
- friendly error category/message
- retry count and row idempotency key
- unique `(import_id,source_row_number)`
- unique `(business_id,row_request_key)`

Create immutable `employee_import_events`:

- tenant/import composite FK
- event type
- actor user
- safe metadata object
- occurred timestamp

RLS:

- owner/admin read import sessions, mappings, rows, and events
- owner/admin request permitted mutations through narrow RPCs
- direct client writes to lifecycle/result/audit columns are denied
- platform administrators retain the existing explicit service boundary
- no cross-tenant employee, role, territory, or manager FK is possible

### Migration 2 — Private file storage

Create private bucket `employee-imports`:

- 10 MB object limit
- accepted MIME types restricted to CSV and XLSX variants
- authenticated owner/admin upload/read/delete policies
- first path segment must equal an authorized `business_id`
- second segment must equal a tenant-owned import ID

Files are deleted 30 days after completion, failure, cancellation, or rollback.
Raw row JSON is removed/anonymized on the same schedule. Counts, mappings,
results, and audit events remain.

### Migration 3 — Invitation lifecycle extension

Extend `business_invitations` with:

- `employee_id` using a composite tenant FK
- `status` constrained to pending, sent, accepted, expired, failed, revoked
- `sent_at`
- `last_resent_at`
- `revoked_at`
- `revoked_by`
- `failure_category`
- `delivery_provider`
- `provider_message_id`
- `send_attempt_count`
- `updated_at`

Do not store provider payloads or tokens in audit metadata. Preserve existing
token and acceptance behavior. Backfill accepted and pending statuses from
existing timestamps.

The acceptance RPC continues to protect stronger existing membership roles and
updates invitation status atomically.

### Migration 4 — Transactional employee import operations

Create narrow RPCs:

- `create_employee_import`
- `save_employee_import_mappings`
- `replace_employee_import_rows`
- `transition_employee_import`
- `apply_employee_import_batch`
- `retry_employee_import_rows`
- `cancel_employee_import`
- `preview_employee_import_rollback`
- `apply_employee_import_rollback`

Every RPC:

- derives actor from `auth.uid()`
- verifies active entitlement
- verifies owner/admin authority
- locks the session/version
- derives business from the session
- validates referenced records against the same tenant
- appends a safe audit event

`apply_employee_import_batch` accepts import ID, expected version, and bounded
row IDs. It does not accept a caller-supplied business ID. Each row is locked
and skipped if already terminal. Employee creation/update and role assignments
occur in one row transaction. A failed row records a friendly category without
reversing already successful rows.

### Migration 5 — Onboarding and activation readiness

Add a centralized view or function returning:

- total employees
- non-owner employees
- active employees
- missing email
- missing workforce roles
- not invited
- pending
- accepted
- expired
- failed invitations
- active/failed import counts
- activation state: not_started, in_progress, employees_added,
  invitations_pending, activated

Epic 2.1 readiness consumes this function. Team setup remains recommended and
does not block basic business onboarding.

## Entitlement service

Add `lib/entitlements.ts` with one evaluator:

```ts
canAccessBusinessCapability(businessId, "team_management")
```

It reads active `business_entitlements` using starts/ends timestamps. The
server-side workspace context may cache the result for one request. Server
actions use the evaluator instead of checking `pilot`, Stripe customer,
subscription, plan, or payment method directly.

Inactive entitlement policy:

- directory/import history remains readable where authorization permits
- new employee, upload, correction, commit, retry, invitation, and rollback
  writes are blocked
- no data is removed
- UI says “Team management access is inactive,” not “Payment required”

## File parsing and safety

### Dependencies

Select one maintained XLSX parser only after a dependency/security review.
Pin its version. CSV parsing should use a streaming parser rather than splitting
the entire file by newline.

### Limits

- maximum upload: 10 MB
- maximum data rows: 2,000
- maximum columns: 100
- maximum header length: 200 characters
- maximum cell text: 5,000 characters
- CSV encodings: UTF-8 and UTF-8 BOM initially
- XLSX: one explicitly selected visible worksheet

Reject:

- `.xls`, macros, encrypted/password-protected workbooks
- malformed ZIP containers and excessive expanded size
- duplicate headers after normalization
- external workbook links
- empty files/sheets
- missing headers
- formulas without a cached scalar value

Never execute formulas. Formula text is treated as untrusted text or rejected
according to field type. Template and failed-row exports prefix values starting
with `=`, `+`, `-`, or `@` with a single quote.

## Field registry and mapping

Create a centralized registry in `lib/employeeImport/fields.ts`:

- stable destination key
- display label
- aliases
- required/optional state
- supported transformations
- sample masking behavior
- normalizer and validator

Initial fields:

- first name
- last name
- full name
- preferred name
- email
- phone
- employee number/external ID
- job title
- employee type
- employment status
- start date
- manager reference
- location
- territory
- skills
- workforce role
- workspace access role
- invite
- notes

The existing employee table lacks structured first/last name, job title,
employee type, employment status, primary location, and manager columns.
Migration design must add these compatibly or map them into existing supported
fields only. The recommended compatible extension is:

- nullable `first_name`, `last_name`, `job_title`, `employee_type`,
  `employment_status`, `manager_employee_id`, and `primary_location_id`
- preserve required `preferred_name`
- backfill structured names only when reliable; never split historical names
  automatically
- derive preferred name from explicitly reviewed preferred/first/full name

## Validation and duplicate engine

Pure server-authoritative modules:

- `normalizeHeader`
- `suggestColumnMapping`
- `normalizeEmployeeImportRow`
- `validateEmployeeImportRow`
- `classifyEmployeeDuplicate`
- `calculateImportCounts`
- `validateResolution`
- `validateElevatedAccess`

Duplicate tiers:

- definite: exact tenant employee number or normalized email
- possible: normalized phone plus name, name/email combination, or name/start
  date with corroborating data
- none: name-only match

Database unique indexes remain the final concurrency safeguard. A unique
violation is translated into “An employee with this email or employee number
was added while this import was being reviewed.”

## Server routes and actions

### Pages

- `/app/[businessSlug]/team`
- `/app/[businessSlug]/team/new`
- `/app/[businessSlug]/team/imports`
- `/app/[businessSlug]/team/imports/new`
- `/app/[businessSlug]/team/imports/[importId]`
- `/app/[businessSlug]/team/imports/[importId]/rollback`
- `/api/team-imports/template`
- `/api/internal/team-imports/process`
- `/api/cron/team-import-retention`

### Server actions

- `createManualEmployee`
- `createImportSession`
- `confirmMappings`
- `saveRowCorrection`
- `applyBulkCorrection`
- `resolveDuplicate`
- `saveRoleAssignments`
- `queueImport`
- `retryFailedRows`
- `cancelImport`
- `sendSelectedInvitations`
- `previewRollback`
- `confirmRollback`

Each action receives the workspace slug and opaque record IDs, calls
`requireWorkspace`, verifies capability and authority, and then calls a narrow
domain operation/RPC. Form values never choose a tenant.

### Worker

The protected worker claims queued sessions using `FOR UPDATE SKIP LOCKED`.
It processes at most 100 rows per batch and records heartbeat/progress. Retry
uses exponential backoff for transient infrastructure failures; validation and
constraint failures remain row-level user corrections. A session whose
heartbeat expires becomes recoverable, not automatically duplicated.

Worker authentication uses a dedicated secret and service role. It accepts an
import ID only, derives tenant context from the database, and logs IDs/counts
without employee PII.

## Invitation integration

Extract current delivery logic from
`app/app/[businessSlug]/team/actions.ts` into a reusable
`EmployeeInvitationService`.

The service:

- saves/renews the tenant invitation
- handles new and existing Supabase Auth users
- records provider outcome
- links an optional employee ID
- rate-limits resend
- never reports delivered without provider evidence
- never logs tokens, email content, or passwords

Manual employee creation with “Invite now”:

1. validate employee and email
2. create employee
3. save optional workforce roles
4. create invitation with selected workspace role
5. attempt delivery
6. preserve employee if delivery fails
7. show one combined result

Admin/manager access requires an explicit elevated-access confirmation.
Owner is never offered.

## UI component plan

Reuse existing Servonas panels, buttons, notices, forms, directory cards, and
workspace navigation.

New components:

- `TeamSetupSummary`
- `TeamSetupChoices`
- `TeamActivationMetrics`
- `EmployeeManualForm`
- `EmployeeImportShell`
- `EmployeeImportProgress`
- `EmployeeFileDropzone`
- `EmployeeImportMapping`
- `EmployeeImportRowReview`
- `EmployeeDuplicateReview`
- `EmployeeImportRoleAssignment`
- `EmployeeImportFinalReview`
- `EmployeeImportResult`
- `EmployeeImportHistory`
- `EmployeeImportRollbackPreview`

Complex row views are paginated server-side. Mobile uses row cards instead of
shrinking a spreadsheet table. Primary actions remain visible after validation
summaries. Focus moves to the stage heading after a successful transition and
to the validation summary after an error.

## Checkpoint implementation sequence

1. Team setup landing and activation counts
2. Manual employee creation and optional invitation
3. Import foundation schema, private bucket, template, upload
4. Persistent session and resume shell
5. Mapping registry and interface
6. Validation, cleanup, inline and bulk correction
7. Duplicate detection and explicit resolution
8. Workforce role/access assignment and elevated safeguards
9. Optional existing-domain assignments
10. Final review
11. Idempotent batch commit and partial success
12. Invitation lifecycle integration
13. Activation dashboard
14. Failed-row correction/retry/export
15. Import history
16. Rollback preview/application
17. Epic 2.1 onboarding integration
18. Security, accessibility, retention, load, and operations audit

Each checkpoint gets one migration at most where practical, focused tests,
type-check, lint, build, tenant-isolation evidence, commit, and push.

## Test plan

### Pure unit tests

- header normalization and aliases
- mapping confidence and conflicts
- normalization of email, phone, date, status, employee type, invite values
- safe full-name handling
- validation messages
- definite/possible duplicate classification
- resolution rules
- elevated-role restrictions
- counts and progress
- retry and rollback eligibility
- CSV injection escaping
- file-limit validation

### Database integration tests

Run against a real local/development Supabase database with RLS enabled:

- Tenant A cannot read or mutate Tenant B sessions/files/rows
- cross-tenant role, manager, location, territory, and employee IDs fail
- manager/staff cannot upload or commit
- inactive entitlement blocks writes but preserves reads
- duplicate commit/retry does not duplicate employees
- row transaction preserves successful prior rows
- invitation acceptance links the intended employee
- owner role cannot be imported
- audit events cannot be mutated
- rollback cannot remove protected employees

### Component/E2E tests

- landing empty state and counts
- manual create without invitation
- manual create with delivery failure
- CSV and XLSX upload
- resume after sign-out
- mapping correction
- inline/bulk correction
- duplicate skip/update/create
- valid-only import
- failed-row retry
- invitation selection/resend/revoke/accept
- history and rollback preview
- keyboard and mobile flow

## Rollout plan

1. Ship schema dark with RLS and integration tests.
2. Enable landing/manual flow for internal Servonas tenants.
3. Enable CSV imports for selected pilot tenants.
4. Add XLSX after parser security and load tests.
5. Enable invitations from imports after rate-limit/provider monitoring.
6. Enable rollback only after protected-reference queries are verified.
7. Expand pilot access after tenant isolation, retention, and failure recovery
   have production evidence.

Temporary feature gates may control import UI visibility, but entitlement still
controls authorization. A hidden UI never substitutes for server checks.

## Operational verification

Before pilot release:

- rehearse all migrations on a clean database
- confirm storage bucket privacy with two tenants
- load test 2,000 rows
- verify worker recovery from timeout
- verify logs contain no employee PII or tokens
- configure failed/stalled import alerts
- monitor parsing duration, commit duration, row failures, resend rates, and
  provider failures using safe counts/categories
- run retention cleanup in dry-run and live modes
- document manual recovery for stuck imports and invitation delivery failures

## Step 2 exit decision

The technical plan is ready for checkpoint implementation. Checkpoint 1 should
change only the Team landing presentation and read-only aggregation. It should
not introduce import tables early. The complete import-session migration must
be reviewed as a lifecycle before Checkpoint 3 applies it.
