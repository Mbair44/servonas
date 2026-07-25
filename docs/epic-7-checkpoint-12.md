# Epic 7 — Checkpoint 12: Route optimization suggestions

Optimization is advisory and never silently changes schedules or assignments.

## V1 workflow

1. The dispatcher calculates the current road routes.
2. **Optimize routes** creates a versioned optimization run.
3. The service generates conservative adjacent-stop candidates within each technician’s existing assignment.
4. Locked, completed, active, and imminent stops are held in place. The default imminent lock is 60 minutes and can be configured with `ROUTE_OPTIMIZATION_LOCK_MINUTES`.
5. Google Routes calculates each candidate. Candidates that miss appointment windows or extend past the existing route-day boundary are rejected.
6. Only candidates with positive provider road-distance or duration savings become suggestions.
7. An owner, administrator, or manager must accept or dismiss each suggestion.
8. Acceptance is version-checked, audited, applied through the Checkpoint 9 atomic reorder operation, and recalculates only the affected technician.

Service dates, technicians, job durations, completed work, and active work are never changed by the optimizer.

## Audit and privacy

`route_optimization_runs` stores normalized input/output snapshots, plan version, requester, status, metrics, and provider request identifiers. `route_suggestions` stores the proposed job order, measured savings, and acceptance/dismissal identity and timestamp. No credentials, technician home coordinates, full provider responses, or large geometry payloads are stored.

## Deployment

Run `supabase/migrations/20260725000300_epic_7_checkpoint_12_optimization_decisions.sql` after the Checkpoint 11 migration.
