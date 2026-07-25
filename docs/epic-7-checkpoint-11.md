# Epic 7 — Checkpoint 11: Concurrency and route editing safety

Every route edit now carries the route-plan version that the dispatcher viewed. Versioned database operations lock the current plan row and compare that token before changing stop order or technician assignment.

If another dispatcher, job update, assignment trigger, or route calculation advanced the plan, PostgreSQL rejects the stale edit with `40001`. The UI shows:

> This route changed while you were editing it. Refresh the route plan before applying your changes.

The edit is not partially applied. Refreshing the dispatch page loads the newest version, calculation revision, timestamp, updater, stops, assignments, routes, metrics, and warnings.

Route plans continue to track:

- `version` for all route-invalidating edits
- `calculation_revision` for calculation starts
- `updated_at`
- `updated_by`
- optimization state through the existing optimization run and suggestion records

Run `supabase/migrations/20260725000200_epic_7_checkpoint_11_route_edit_concurrency.sql` after the Checkpoint 9 migration.
