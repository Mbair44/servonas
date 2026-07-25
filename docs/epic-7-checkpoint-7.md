# Epic 7 Checkpoint 7 — Large Route and Waypoint Handling

## Provider limit and splitting

Google Routes calculations are limited to 25 intermediate waypoints per
request. Servonas therefore sends at most 27 ordered waypoints per request:
one origin, 25 intermediates, and one destination.

Routes longer than 27 stops are divided into sequential segments. The last
waypoint of one segment becomes the first waypoint of the next. That shared
point is not counted as another leg, so no stop is omitted and no distance or
duration is double-counted.

## Geometry and metrics

- Successful segment totals are summed from provider-calculated road legs.
- Fully successful segment polylines are decoded, joined at their shared
  boundary, and re-encoded as one compact route polyline.
- Every leg retains its global sequence and its segment's provider request ID.
- Full provider payloads are not stored.
- Persisted distance remains meters and duration remains seconds.

## Partial failure

If one segment fails, its legs are stored as failed without distance, duration,
or geometry. Other successful legs remain authoritative and are included in
the partial route totals. The map renders each successful leg separately, so it
never draws a straight connection across a failed segment.

Arrival estimates stop at the first failed segment because downstream arrival
times cannot be claimed without the missing driving duration.

## Safeguards and cost

Servonas supports up to 250 scheduled stops per technician per day. This is an
application cost and execution-time safeguard, not a provider waypoint limit.
A 250-stop route requires up to 10 provider requests. Unchanged route
signatures remain cached, so repeated page views and unchanged recalculations
do not incur those calls.

Requests are sequential per technician to avoid traffic spikes. Provider
pricing applies per segment request; production Google Cloud budgets, quota
limits, and billing alerts remain required.

## Database changes

None. Existing `route_legs.provider_request_id`, calculation status, error code,
and encoded polyline fields support segmented request grouping and partial
failure state.
