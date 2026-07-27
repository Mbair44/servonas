# Epic 8.5 AI readiness and production review

Servonas does not execute AI for territory planning. Current recommendations use versioned, transparent business rules. The `territory_scenario_decisions` contract preserves the inputs, source, version, category scores, explanation, actor, and outcome needed to evaluate future rules or models without overwriting history.

## Security boundaries

- Every scenario, territory snapshot, decision, and apply event carries `business_id`.
- Database RLS limits scenario reads to office roles and mutations to owner/admin roles.
- Approve and apply operations derive the actor from `auth.uid()`, validate tenant membership in the database, lock the scenario row, and apply changes atomically.
- Decision and apply histories are immutable. New outcomes must be appended.
- Elevated/background services must accept a narrow scenario operation, derive tenant context from the stored scenario, and must not expose a generic service-role database client.

## Explainability contract

Persist the source (`human`, `business_rules`, `optimization`, or future `ai`), source version, exact scenario and simulation revisions, normalized input snapshot, category weights/scores, explanation, recommendation, actor, and outcome. Never silently replace a prior recommendation after inputs or logic change.

## Performance strategy

- Scenario calculations use tenant-scoped, bounded fact queries and do not mutate live data.
- `simulation_revision` is the incremental recalculation key and future worker idempotency key.
- Large tenants should move recalculation to a queue keyed by `(business_id, scenario_id, simulation_revision)`.
- Cache only results tied to an exact revision. Discard stale worker output.
- Geometry remains GeoJSON for territory editing; route geometry remains encoded polyline. Provider responses are not scenario inputs.

## Future capabilities

Suggested territories, balancing, hiring recommendations, expansion planning, forecasting, route-density optimization, and technician recommendations can write the same decision contract. Production activation still requires evaluation datasets, bias/error review, confidence calibration, monitoring, human approval, and rollback controls.

## Remaining operational verification

Run clean-database migrations and RLS integration tests with multiple real tenants. Load-test representative large customer sets, establish query/worker limits, and monitor recalculation latency and failure rates before enabling high-volume automated planning.
