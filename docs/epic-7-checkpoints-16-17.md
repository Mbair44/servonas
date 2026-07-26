# Epic 7 Checkpoints 16–17

## ETA and notification readiness

Route calculation remains separate from delivery. `job_communication_events`
continues to be the delivery ledger and now supports route-plan/stop references,
normalized confidence context, explicit delivery state, and an event idempotency
key. Business routing policies default every route-notification category to off.

A scheduled-window notice may use the stored appointment window. An en-route
notice requires the technician/job state to be en route. A proximity ETA is
eligible only when the technician is en route, the prior stop is completed, the
route calculation is current, provider-calculated driving time exists, and
confidence is high. It is still an estimate, not a live GPS ETA.

Customer `preferred_contact_method`, booking `sms_consent`, available contact
details, and the tenant policy must be checked before enqueueing. The unique
`event_key` index prevents duplicate channel delivery. Provider stub, queued,
sent, and failed statuses remain explicit.

## Route metrics

Daily and historical reporting uses only provider-calculated route/leg values.
Distances persist in meters and durations in seconds. UI formatting converts
those values to miles and minutes and labels them **Estimated**. Failed route
values are excluded rather than replaced with straight-line values.

Historical sources are `route_plans`, `technician_routes`, `route_stops`,
accepted `route_suggestions`, jobs, and their timestamps. This supports
estimated route miles/time, miles per completed job, route-efficiency trend,
unassigned-job rate, appointment-risk rate, and applied optimization savings.
These values must never be described as GPS mileage or odometer mileage.

## Migration

Run `20260725000600_epic_7_checkpoints_16_17_eta_metrics.sql` after the
Checkpoint 15 migration.
