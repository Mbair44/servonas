# Epic 2.2 — Employee Import and Team Activation

## Step 1: Discovery and UX plan

### Existing architecture

Relevant files:

- `supabase/migrations/20260726000100_epic_8_checkpoint_1_workforce_domain.sql`
  defines tenant-owned employees, workforce roles, effective-dated role
  assignments, and the employee/member synchronization trigger.
- `app/app/[businessSlug]/team/page.tsx` is the existing workforce directory,
  operational summary, quick-add form, and invitation entry point.
- `app/app/[businessSlug]/team/workforceActions.ts` creates and edits employees
  and validates all referenced workforce-role IDs inside the current tenant.
- `components/EmployeeForm.tsx` is the existing progressive employee form.
- `app/app/[businessSlug]/team/actions.ts` persists invitations, calls Supabase
  Auth or Resend, supports existing Auth users, and handles resend/revoke.
- `app/invite/accept/actions.ts` validates invitation email and calls the
  tenant-safe invitation acceptance RPC.
- `supabase/epic_2_business_onboarding.sql` defines the current invitation
  record and its tenant-scoped RLS policies.
- `lib/workspace.ts` is the centralized authenticated workspace and active
  entitlement gate. It does not require Stripe.
- `lib/access.ts` distinguishes owner/admin management from manager/staff
  access.
- `lib/workforce.ts` contains the current employee validation.

No background-job framework, import framework, spreadsheet parser, or
tenant-private import-file bucket currently exists. There is no product
analytics client to reuse. Existing audit patterns use tenant-scoped,
append-only database event tables.

### Domain relationships

An employee and a user are deliberately different:

```text
business
  ├── employees                       workforce identity; no login required
  │     ├── employee_role_assignments work performed in the business
  │     └── technician_profiles       optional field-service capability
  ├── business_invitations            pending access request by email
  └── business_members                authenticated tenant access and app role
          └── auth.users
```

- Importing creates or updates `employees`.
- Importing never creates a login merely because an email is present.
- Inviting creates or renews `business_invitations` and invokes the existing
  delivery service.
- Accepting creates `business_members`; the existing database trigger links or
  creates the tenant employee identity.
- Workforce roles describe work. Membership roles describe application
  access. They must not be merged.
- Technician capability remains an explicit optional relationship and must not
  be inferred from a workspace access role alone.

### Proposed information architecture

The current Team route remains the permanent workforce destination.

```text
/app/:business/team
  Team setup / activation landing
  Employee directory
  Manual add
  Invitation status
  Previous imports

/app/:business/team/imports/new
  Upload
  Match columns
  Review data
  Resolve duplicates
  Assign roles
  Review import
  Import
  Invite team

/app/:business/team/imports/:importId
  Resume at current stage
  Completed/failed result
  Failed-row correction
  Audit history
  Rollback preview
```

The landing page leads with two equal, plain-language choices:

1. **Add one employee** — best for one or two people.
2. **Import employees** — best for an existing spreadsheet or larger team.

It also shows employee, pending-invitation, and failed-import counts and
explains that an employee record does not automatically grant login access.

### Import journey

#### 1. Upload

The owner selects CSV or XLSX. The page states limits, privacy behavior, and
that nothing is imported or invited yet. A template and instructions are
available. Upload creates a persistent session before parsing begins.

States: empty, selected, uploading, parsing, unsupported, too large,
password-protected, malformed, parsed.

#### 2. Match columns

Source headers appear beside sample values and suggested Servonas fields.
Exact aliases receive high confidence; normalized aliases receive medium
confidence; uncertain columns remain ignored. Duplicate destination mappings
and missing usable names block continuation. Mapping is saved on every
confirmation, not only in browser memory.

States: automatically matched, needs attention, ignored, conflicting,
required field missing, saved.

#### 3. Review data

Paginated normalized rows are grouped as Ready, Warning, Needs attention,
Existing employee found, or Ignored. Users edit cells without restarting.
Common bulk fixes have an explicit preview.

States: validating, ready, warning, invalid, ignored, revalidating.

#### 4. Resolve duplicates

Definite matches use tenant-scoped normalized email or employee number.
Possible matches may use phone plus name or similar corroborating fields.
Names alone never create a definite match.

Each match shows imported and existing values side by side. Definite matches
default to Skip. Update and merge require explicit field choices. Import never
changes workspace access.

States: no match, possible, definite, skip, create new, update selected fields.

#### 5. Assign roles

Employee type and workforce roles are selected independently from application
access. Users may leave either optional. Invitations remain off by default.
Owner transfer is prohibited through import. Admin/manager access requires a
separate explicit confirmation by an authorized owner/admin.

States: no access, safe access, elevated access needs confirmation, invalid
role, unresolved optional assignment.

#### 6. Review import

The confirmation lists new employees, explicit updates, skipped rows,
warnings, blockers, invitations, and unresolved assignments. The two safe
paths are:

- **Import ready rows** and retain invalid rows for correction.
- **Fix everything first** and perform no import yet.

The final action names exact effects, for example: “Import 24 employees
without invitations.”

#### 7. Import

The server transitions the session to importing and commits rows in bounded
batches. Session ID plus row ID is the idempotency boundary. Successful rows
cannot be re-created on retry. Each row has its own result and friendly failure
reason.

States: queued, importing, completed, completed with errors, failed, canceled.

#### 8. Invite team

After import, only eligible selected employees are invited. Email presence
never implies consent to invite. Existing delivery, acceptance, resend, and
revoke logic is reused.

States: not invited, pending/sent, accepted, expired, failed, revoked. The UI
must not claim “delivered” without provider delivery evidence.

### Import-session state machine

```text
uploaded
  → mapping
  → validating
  → needs_review
  → ready
  → importing
  → completed | completed_with_errors | failed

uploaded|mapping|validating|needs_review|ready
  → canceled

completed|completed_with_errors
  → rollback_pending
  → rolled_back | rollback_partial | rollback_blocked
```

Every transition records actor, previous state, next state, safe counts, and
timestamp. A version column provides optimistic concurrency. Browser requests
cannot set counts or terminal states directly.

### Wireframe-level descriptions

#### Team setup landing

Header: “Add your team to Servonas.”

Compact activation metrics sit below it. Two large action cards explain
manual versus import choices. The directory follows, with invitations and
recent imports in secondary panels. With only the owner present, the directory
is replaced by guided copy rather than a blank table.

#### Upload

A narrow wizard header shows stage and saved status. The main card contains a
keyboard-accessible drop zone and file picker. A side card shows accepted
formats, limits, privacy, and template download. No invitation controls appear.

#### Mapping

Each source column is a card/row containing its name, three safe samples,
destination select, required/optional status, and confidence label. A sticky
summary shows mapped, ignored, conflicting, and missing-required counts.

#### Data review

Desktop/tablet use a paginated table with frozen row number and status. Mobile
uses one employee card per row. Selecting a row opens an edit region without
losing the current page. Bulk actions always show affected-row count.

#### Duplicate review

Two-column comparison uses “Existing employee” and “Spreadsheet” headings.
Actions state their consequence. Existing data is never overwritten by a
generic Continue button.

#### Final review

Separate “Will happen” and “Will not happen” panels explicitly state employee
creation, updates, skips, invitations, and access roles. Blocking errors sit
above the final action.

#### Result and activation

Successful and failed counts lead. Failed rows remain actionable. Invitation
selection is a separate next step. History and rollback are secondary,
permission-gated actions.

### Proposed schema changes

Use typed status/count columns and constrained JSON only for source/normalized
cell maps:

- `employee_imports`
  - tenant, uploader, file metadata/checksum, status, stage, typed counts,
    settings, timestamps, version, retention/deletion timestamps.
- `employee_import_column_mappings`
  - source column, destination, transformation, confidence, ignored flag.
- `employee_import_rows`
  - source row, raw/normalized values, validation/duplicate/resolution status,
    existing/created employee IDs, invitation action/result, error category,
    retry count, idempotency key.
- `employee_import_events`
  - immutable, tenant-scoped lifecycle audit.
- Optional later `employee_import_mapping_profiles` after the core mapping
  workflow proves useful.

Composite tenant foreign keys are required for import-to-employee references.
RLS grants read/write only to owner/admin; manager import access should not be
added until product permission policy explicitly allows it. Service-role
processing must accept an import ID, derive the tenant from that row, and never
trust a caller-supplied business ID.

The original file belongs in a private `employee-imports` bucket using
`business_id/import_id/...` paths. Default retention is 30 days after terminal
completion. Raw rows follow the same retention window; immutable summary and
audit events remain.

### Processing direction

- CSV parsing can be server-side and streamed.
- XLSX support requires a carefully selected dependency with explicit formula,
  external-link, encrypted-workbook, archive-size, sheet, row, and column
  limits.
- Small imports may parse synchronously, but commit semantics should already
  use batches and resumable session state.
- The repository has no queue today. Initial pilot processing can use a
  protected worker/cron endpoint that claims queued sessions with
  `FOR UPDATE SKIP LOCKED`; browser requests only enqueue and poll.
- Recommended limits: 10 MB, 2,000 data rows, 100 columns, one selected visible
  worksheet. Hidden sheets are ignored and reported.

### Entitlement and authorization

`requireWorkspace` already verifies an active tenant entitlement independently
of Stripe. All UI routes and server actions should reuse it. Import database
operations additionally verify owner/admin authorization and tenant ownership.
Inactive access preserves read-only history and blocks new upload, mutation,
commit, retry, invitation, and rollback operations with an entitlement-focused
message.

### Risks and compatibility concerns

1. Current `business_invitations` lacks explicit failed, revoked, resent, and
   provider-result columns. Extend it; do not create a second invitation table.
2. Current invitation uniqueness is one row per tenant/email. Resend currently
   reuses its token. Epic 2.2 needs an explicit supersession/rate-limit policy.
3. Current employee uniqueness on normalized tenant email and employee number
   is a strong final safeguard but not a substitute for preview.
4. Manual creation currently requires preferred name rather than structured
   first/last names. Add structured optional fields compatibly or derive a
   reviewed preferred name; do not break existing screens.
5. Current employee/role creation uses multiple application statements.
   Import commit needs a centralized transactional database operation.
6. Accepted invitations can make deletion unsafe. Rollback must deactivate
   employees with memberships or operational references.
7. Spreadsheet libraries are a new supply-chain and archive-processing risk.
8. Raw employee data must never appear in logs, analytics, public URLs, or
   provider metadata.
9. Manager access is currently read-oriented; the specification mentions
   office managers, but existing `canManageBusiness` permits owner/admin only.
   Expanding manager permissions requires an explicit product decision and
   scoped permission, not a broad authorization change.

### File-by-file implementation direction

- `app/app/[businessSlug]/team/page.tsx`: activation landing metrics, choices,
  empty state, invitation summary, recent imports.
- `app/app/[businessSlug]/team/imports/new/page.tsx`: upload entry.
- `app/app/[businessSlug]/team/imports/[importId]/page.tsx`: server-routed
  resumable stage shell.
- `app/app/[businessSlug]/team/imports/actions.ts`: narrow upload, mapping,
  validation, correction, commit, retry, and rollback server actions.
- `components/employee-import/*`: drop zone, progress, mapping rows, paginated
  review, duplicate comparison, role assignment, final review, results.
- `lib/employeeImport/*`: file safety, header aliases, normalization,
  validation, duplicate classification, counts, CSV export protection,
  lifecycle rules.
- `lib/entitlements.ts`: central capability evaluator layered on the existing
  entitlement records rather than scattered pilot checks.
- `lib/communications/*`: reuse/extract invitation delivery behind one service
  rather than duplicating provider logic.
- `supabase/migrations/<timestamp>_epic_2_2_*`: import foundation, RLS,
  transactional operations, invitation status extensions, audit, storage.
- `tests/employeeImport*.test.ts`: pure parsing/mapping/validation/security
  tests plus database-backed tenant/RLS integration tests when credentials are
  available.

### Step 1 exit decision

The UX is coherent enough to proceed to the technical plan. Implementation
should begin with the Team setup landing and manual employee flow, while the
import-session schema is reviewed as one complete lifecycle before its first
migration is applied.
