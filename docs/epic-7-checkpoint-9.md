# Epic 7 — Checkpoint 9: Manual stop reordering

Authorized owners, administrators, and managers can reorder stops inside one technician route from the expanded dispatch route panel.

## Interaction and safety

- Native drag and drop is available for pointer users.
- Up and Down controls provide keyboard and touch access.
- Locked and completed stops cannot be displaced.
- Moving a route containing an en-route, arrived, or in-progress stop requires explicit confirmation.
- The preview describes the new order and provider recalculation without inventing mileage or time savings.

## Persistence

`reorder_technician_route_stops` validates the full ordered job set, permissions, tenant, route, locks, and protected job states in one transaction. It applies sequences in two phases to avoid unique-index collisions, marks manual overrides, removes obsolete legs, advances the plan version, and marks only the affected technician route stale.

After persistence, the server recalculates only that technician using Google road routing. Other technician routes remain intact, and plan totals are rebuilt from all persisted ready or partial routes.

## Deployment

Run `supabase/migrations/20260725000100_epic_7_checkpoint_9_manual_stop_reordering.sql` before using the controls.
