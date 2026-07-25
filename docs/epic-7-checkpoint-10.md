# Epic 7 — Checkpoint 10: Technician reassignment

The existing dispatch assignment control supports technician-to-technician moves, unassigned-to-technician assignment, and returning work to unassigned.

## Centralized consistency

All assignment changes continue through the `set_job_primary_technician()` database operation. It locks the job, verifies tenant and role access, closes the prior active primary assignment, creates the new assignment when applicable, and synchronizes `jobs.assigned_technician_id` in one transaction. Historical `job_assignments` rows are preserved.

The dispatch server action validates the unchanged appointment timing against the destination technician before invoking that operation. Job scheduling fields are not rewritten during reassignment.

## Route effects

The old and new technician routes are invalidated by the existing assignment triggers and recalculated individually. Unaffected technician routes are retained. Route geometry, stops, legs, totals, warnings, and plan aggregates are rebuilt from actual road routing.

Before-and-after mileage and duration are shown only when every impacted route has comparable provider-calculated metrics. Otherwise the UI explicitly says that comparable impact was unavailable and does not claim savings.

No new migration is required for Checkpoint 10; it depends on the existing Epic 5 assignment transaction and Epic 7 route-staleness triggers.
