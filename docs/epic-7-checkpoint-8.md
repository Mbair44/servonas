# Epic 7 — Checkpoint 8: Route warnings and scheduling risk

Route risk rules live in `lib/routing/warnings.ts`. The dispatch server evaluates them once from the authorized daily job, route, stop, and leg results, then sends safe warning text to the map workspace.

## Data confidence

- Lateness and insufficient-travel warnings require a persisted provider road duration or calculated route ETA.
- Missing road data is described as pending, partial, failed, or uncertain. Straight-line distance is never used to claim that a technician will be late.
- Persisted distance remains meters and duration remains seconds. Conversion to miles and minutes is presentation only.

## Initial policy thresholds

- Excessive driving: more than 8 hours of provider-calculated road duration.
- Excessive mileage: more than 200 provider-calculated road miles.

These constants are centralized as `ROUTE_RISK_THRESHOLDS` so a future business-level policy can replace them without changing the warning UI.

## Scope

Checkpoint 8 adds warnings for appointment-window risk, insufficient verified travel time, overlapping jobs, missing coordinates, partial/failed/stale routes, missing technician start locations, excessive road travel, unassigned jobs, and stop-order/window conflicts. Working-hours boundary warnings remain dependent on a future route-day start/end model; existing scheduling validation continues to enforce technician working hours when jobs are assigned or moved.

No database migration is required for this checkpoint.
