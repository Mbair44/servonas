# Route plan calculation revision compatibility repair

Migration `20260726000400_repair_route_plan_calculation_revision.sql` repairs
databases where the Epic 7 audit trigger was installed but
`route_plans.calculation_revision` was absent.

The drift produced Postgres error `42703` during the final route-plan update.
Technician routes, legs, metrics, and geometry could be complete while the parent
plan remained `calculating`. The dispatch page also selected the absent column,
causing the plan query to fail and incorrectly display `not calculated`.

The migration:

1. Adds and backfills `calculation_revision`.
2. Restores its non-negative constraint and calculation-start trigger.
3. Recovers stuck parent plans from completed technician-route states.
4. Reloads the PostgREST schema cache.

Verify:

```sql
select service_date,calculation_status,calculation_revision,
       total_driving_distance_meters,total_driving_duration_seconds
from public.route_plans
where id='bcfb0a4e-841c-43d3-9a00-d4b176dbae06';
```

The known plan should be `ready`, revision should be non-null, and the totals
should be `17763` meters and `1436` seconds.
