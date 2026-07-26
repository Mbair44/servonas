# Epic 8 Workforce Intelligence

## Source of truth

- `employees` owns workforce identity and lifecycle. An auth account is optional.
- Effective-dated role, qualification, territory, asset, and availability records
  own operational readiness. Technician profiles remain the dispatch adapter.
- `workforce_metric_facts` owns measurements in cents, seconds, and meters.
- `workforce_history_events` is append-only historical state. Bootstrap events
  describe migration-time state only.
- Scheduling preferences and customer continuity signals are inputs, never
  authorization rules or automated recommendations.

## Security review

Every workforce table has RLS enabled. Owner/admin users manage identity,
readiness, assets, and preferences. Managers have operational read access and
may record explicit customer/dispatcher signals. Employees can read their own
availability, qualifications, assignments, metrics, and history. Direct contact,
legal identity, free-text notes, and credential numbers are excluded from
historical snapshots.

Tenant-scoped composite foreign keys prevent cross-business references. Atomic
database functions manage primary job assignments and asset custody. No
workforce operation accepts an unverified tenant identity from a public route.

Run `supabase/audits/20260726000800_epic_8_workforce_security_audit.sql` against
the target database with RLS enabled before production rollout.

## Performance

Operational lookup and historical timeline indexes lead with `business_id`.
The Team page requests bounded current-day and 30-day datasets in parallel.
Historical metrics are aggregated by a security-invoker view rather than by
loading raw fact history into the application.

At substantially larger tenant sizes, move the feature summary to incrementally
refreshed tenant aggregates. Keep raw facts immutable.

## Import and invitation readiness

Manual employee creation requires only a preferred name. The employee number
and tenant-scoped email uniqueness rules are stable CSV matching keys. Imports
should call a future narrow, idempotent server operation rather than write
related tables independently. Existing email invitations automatically link
accepted workspace members to employee records.

## Future AI readiness

The foundation preserves qualifications, availability, capacity, territories,
historical workload, measured performance, explicit preferences, customer
continuity, and dispatcher outcomes. It does not score employees, recommend
assignments, or make autonomous scheduling decisions.
