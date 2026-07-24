# Epic 7 Checkpoint 4 — Daily Dispatch Map

Date: 2026-07-24

## Implementation

The existing `/app/[businessSlug]/dispatch` page remains the canonical office
dispatch experience. A responsive map workspace now appears above the unchanged
assignment board.

The server component performs the tenant-scoped job, technician, route-plan, and
technician-route queries. The browser receives only the fields needed to render the
selected business day. It does not receive private geocoding metadata or provider
errors.

The map supports:

- previous day, today, next day, and date-picker controls in the business time zone;
- all-technician or focused-technician views;
- technician, job-status, assignment, route-issue, and text-search filters;
- verified/manual service-location markers;
- numbered assigned stops and distinct unassigned markers;
- persisted provider polylines when actual road geometry exists;
- route legend with consistent technician colors and initials;
- fit-visible, full-screen, completed, unassigned, route-line, and label controls;
- job information windows linking to the job record;
- missing-coordinate warnings linking to affected jobs;
- loading, empty, no-coordinate, key-not-configured, and map-provider-failure states.

The existing dispatch columns remain below the map, so assignment, job-status,
contact, schedule-conflict, and directions functions work without Google Maps.

## Accuracy boundary

Checkpoint 4 does not calculate routes. It displays an encoded polyline only when a
persisted `technician_routes.encoded_polyline` exists. It never draws straight lines
between markers and never displays fabricated driving distance or duration.

Before Checkpoint 6 calculates road routes, the map shows verified stops with the
explicit message that route lines and driving metrics are not yet calculated.

## Address safety

Only locations whose Checkpoint 3 status is `verified` or `manual`, whose coordinate
pair is finite and in range, and whose pair is not the unresolved `0,0` placeholder
are mapped. Stale, pending, ambiguous, failed, and legacy coordinates remain in the
dispatch list but are excluded from the map and surfaced in the attention list.

## Configuration

The map uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. This browser key must be restricted
to approved production and preview HTTP referrers and the Maps JavaScript API.
Server geocoding and future routing keys are not passed to the component.

## Database changes

None. Checkpoint 4 reads the Checkpoint 2 route foundation and Checkpoint 3 trusted
service-location coordinates.

## Deferred

- Expanded technician route panel and synchronized stop rows: Checkpoint 5.
- Google Routes server calculations, leg metrics, and persisted road geometry:
  Checkpoint 6.
- Office/depot and private technician start/end markers: later approved origin
  settings checkpoint.
- Route optimization, reassignment previews, ETA, and technician mobile route map:
  later checkpoints.

