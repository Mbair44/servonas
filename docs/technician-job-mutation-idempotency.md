# Technician job mutation idempotency

This change hardens technician-originated status transitions and technician notes. It does not add mobile write endpoints, billing orchestration, SMS outbox processing, or customer notifications.

## Authorization

`transition_assigned_job_status_v2(job_id, status, request_id)` requires the calling authenticated user to have an active, assignable technician profile and to hold the active **primary** `job_assignments` row for the job. The supported technician lifecycle is only `dispatched → en_route → arrived → in_progress → completed`.

`append_assigned_job_note_v2(job_id, note, request_id)` requires an active assignment and active technician profile. Both the primary technician and active helpers can use it; observers, removed assignments, inactive profiles, cross-tenant callers, and unassigned callers cannot.

The two-argument legacy RPCs remain available for existing consumers, but call the hardened versioned functions. They generate an ID server-side, so they are authorization-safe but are not replay-idempotent. New callers must use the v2 functions.

## Replay semantics

`job_mutation_requests` is tenant-scoped and keys an outcome by actor, business, job, operation, and caller-supplied UUID request ID. The request fingerprint is canonicalized from the action payload (`status` or trimmed note body).

- Repeating the same key with the same fingerprint returns the stored outcome and does not write a second status, note, history, or timeline event.
- Reusing the same key with a different fingerprint fails with PostgreSQL `23505`; clients should surface this as a conflict and ask the user to refresh.
- Authorization is checked before a stored outcome is replayed. Losing an assignment or technician eligibility prevents replay access.
- The job row is locked before the ledger is checked or changed, serializing identical and competing operations for that job.

There is deliberately no automated retention cleanup. Deleting a request row can permit a duplicate logical submission, so the conservative policy is to retain committed requests indefinitely until an approved archival/deletion process can prove that it exceeds every supported client retry and audit window. The ledger stores only identifiers, a SHA-256 fingerprint, mutation metadata, and outcome IDs/statuses; it stores no customer payload.

## Billing and SMS boundary

The pre-existing web technician flow still invokes rental SMS after `en_route` and billing after `completed`. Those calls occur after the database status transition and are not part of this transaction or replay ledger. This PR makes neither atomic nor exactly-once; the transactional billing/SMS outbox remains a separate future change.

## Deployment and rollback

Deploy the additive migration before the web code that calls v2. The legacy wrappers preserve existing RPC signatures while enforcing primary-only status transitions. Rolling back the web code is safe after the migration because legacy wrappers remain. Do not drop the ledger or v2 functions as a rollback shortcut: doing so removes replay protection and can re-enable duplicate execution.
