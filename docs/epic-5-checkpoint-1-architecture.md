# Epic 5 Checkpoint 1.1 architecture decisions

## Primary technician assignments

The active `job_assignments` row with `assignment_role = 'primary'` is the
authoritative assignment record. `jobs.assigned_technician_id` is a synchronized
read cache used by job lists, schedule queries, and dispatch queries.

Applications must call:

```sql
select public.set_job_primary_technician(job_id, technician_id);
```

Passing `null` clears the primary assignment. The function locks the job,
validates tenant ownership and technician eligibility, retires the previous
primary assignment, creates or promotes the new primary assignment, and updates
the job cache in one transaction. Guard triggers reject direct one-sided writes
to either primary representation, including service-role writes.

Helper and observer assignments can use `job_assignments` directly, subject to
RLS. Primary assignments cannot.

## Monetary fields

The existing column names remain the API contract:

- `subtotal`: authoritative pre-tax, pre-discount amount. This corresponds to
  the domain concept `subtotal_amount`; a duplicate column is not introduced.
- `tax_amount`: tax added to the subtotal.
- `discount_amount`: discount subtracted from subtotal plus tax.
- `total_amount`: the only authoritative final total. It is generated as
  `greatest(subtotal + tax_amount - discount_amount, 0)` and cannot be written
  independently.
- `net_total_amount`: not part of the final model. The migration removes this
  early-draft column if it exists.

Existing screens continue reading `total_amount` and therefore automatically
receive the discount-aware result.

## Technician authorization boundary

`technician_profiles` do not grant access by themselves. Authorization still
comes from `business_members`.

At Checkpoint 1.1, every ordinary business member—including a member who is a
technician with role `staff`—can read all tenant customers, service locations,
jobs, assignments, technician profiles, and status history. Only
owner/admin/manager roles can create or update operational records. Technicians
cannot update job status or assignments yet.

Before Checkpoint 6, broad member read policies must be replaced or supplemented
with technician-specific policies that restrict technicians to authorized jobs
and only the customer/location data needed for those jobs. The technician route
must also enforce assignment ownership server-side. Technician status-transition
updates should go through a centralized transition function with a restricted
transition map; broad job-update permission must not be granted to `staff`.

## Historical tenant constraints

Composite tenant foreign keys are installed `NOT VALID`. PostgreSQL enforces
them for new writes immediately, while historical rows remain unvalidated.
Run
`supabase/audits/epic_5_checkpoint_1_historical_integrity.sql` and remediate
every reported row before validating the constraints with the commented
commands at the bottom of that audit.

## Migration-order prerequisite

The repository predates standard Supabase migration tracking: Epic 1–4.5 SQL
files remain under `supabase/` rather than `supabase/migrations/`. The Epic 5
migration therefore targets an existing Servonas development database that has
already received the schema through Epic 4.5. A preflight block checks the
required tables and tenant authorization functions before making changes.

A fresh `supabase db reset` cannot reconstruct the historical application schema
until those earlier SQL files are consolidated into a reviewed baseline
migration. Do not copy them into `supabase/migrations` casually, because linked
databases may already contain those objects without corresponding migration
history.
