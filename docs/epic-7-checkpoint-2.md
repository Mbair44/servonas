# Epic 7 Checkpoint 2 — Routing Domain Foundation

Date: 2026-07-24

## Source of truth

Scheduled `jobs` and their active primary `job_assignments` remain authoritative.
`route_plans`, `technician_routes`, `route_stops`, and `route_legs` are derived,
versioned planning snapshots. Creating or calculating a route does not modify a
job or assignment.

Any future route suggestion that changes the primary technician must use
`set_job_primary_technician()`. Direct one-sided assignment writes remain blocked
by the Epic 5 guards.

## Driving metrics

- `driving_distance_meters` and `driving_duration_seconds` contain only
  road-network provider results.
- `straight_line_distance_meters` is separate, nullable, and may only support an
  explicitly labeled internal/fallback heuristic.
- Ready route legs require provider provenance, calculated time, and integer road
  metrics.
- Partial or failed legs keep driving metrics nullable. They are excluded from
  route totals.
- Road geometry is persisted as compact encoded polylines. Redundant JSON geometry
  and complete provider responses are intentionally not stored.
- Travel mode is an extensible text value with optional vehicle profile/options,
  allowing future provider modes without a schema migration.

## Tenant and technician access

- Owner, admin, and manager roles can manage routing data for their business.
- Technicians can select only their own technician route.
- Technician stop access additionally requires current assignment to the stop's
  job.
- Technicians cannot read optimization inputs, outputs, or suggestions.
- General technician-route rows cannot contain an address or coordinates when an
  origin or destination is marked private. Checkpoint 3 must place any technician
  home/start data in a separately protected store.
- Anonymous users have no routing policies.
- Composite foreign keys prevent records from joining data across businesses.
- Composite route/plan keys also prevent a leg from referencing another
  technician's stop and prevent a suggestion from referencing an optimization run
  belonging to another route plan.

## Stale-state behavior

Non-archived daily route plans are marked `stale` and their optimistic concurrency
version is incremented when relevant source data changes:

- job schedule, duration, appointment window, location, address, assignment,
  status, or deletion state;
- any job-assignment mutation;
- a referenced service-location address, Place ID, coordinate, active state, or
  deletion state.

Dates are derived in the business time zone. Existing route geometry may remain
stored for diagnostics/display but is explicitly stale and must not overwrite a
newer calculation without matching both plan version and calculation signature.
Beginning a new calculation also increments `calculation_revision` and ensures the
route-plan `version` advances, even when the state transition is written directly.

## Applying the migration

With a linked Supabase CLI project:

```sh
npx supabase migration up --linked
```

For a local Supabase stack:

```sh
npx supabase start
npx supabase db reset
```

If applying through the SQL editor, run:

1. `supabase/migrations/20260724001000_epic_7_checkpoint_2_routing_foundation.sql`
2. `supabase/audits/20260724001000_epic_7_checkpoint_2_routing_audit.sql`

Every `failing_rows` result in the audit must be zero. All six routing tables must
show `rls_enabled=true`, and every routing foreign key must show
`convalidated=true`.

The migration creates only new, initially empty routing tables. Consequently it
adds no `NOT VALID` foreign keys and has no historical rows to validate. The audit
still documents every composite relationship for future backfills/imports.

## Known limitations

- No provider adapter or route calculation exists yet.
- No geocoding-state or route-origin settings exist yet; those belong to
  Checkpoint 3.
- No dispatch map or routing UI exists yet.
- Provider geometry retention/attribution terms must be confirmed before
  production route persistence.
- The migration has not been applied from this workspace because no usable local
  Supabase CLI/database connection is available.
