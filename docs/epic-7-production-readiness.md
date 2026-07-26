# Epic 7 Production Readiness

## Provider and environment setup

Servonas currently uses Google Maps JavaScript for the browser map, Google
Geocoding/Place Details for verified service locations, and Google Routes for
server-side road routing.

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: browser-safe, HTTP-referrer restricted key
  with only Maps JavaScript API and required browser Places APIs.
- `GOOGLE_MAPS_API_KEY`: server-only geocoding key. Restrict by deployment
  egress IP where the hosting platform supports it and allow only required
  geocoding/place APIs.
- `GOOGLE_ROUTES_API_KEY`: server-only Routes API key. It may currently reuse
  the server Maps key, but a separately restricted key is recommended.
- `ROUTING_PROVIDER=google`
- `GEOCODING_PROVIDER=google`
- `NEXT_PUBLIC_GOOGLE_MAP_ID`: optional Google cloud map ID.
- `ROUTE_IMMINENT_JOB_LOCK_MINUTES`: fallback only; tenant database policy wins.

Never prefix server routing/geocoding keys with `NEXT_PUBLIC_`. Enable API and
billing quota alerts in Google Cloud. Review Routes and Geocoding pricing in
Google Cloud before production traffic.

## Calculation and caching

Routes are calculated over the road network. Encoded polylines, meters, seconds,
provider name, request ID, warnings, and calculation timestamps are persisted.
Full provider responses are not stored. A SHA-256 calculation signature reuses
unchanged ready routes. Scheduling, address, assignment, duration, or endpoint
changes mark impacted plans stale. Recalculation increments the plan revision.

Large schedules are split at the provider-neutral waypoint ceiling with a shared
boundary waypoint. Daily stop limits fail explicitly. Partial provider results
persist only valid road legs and exclude invalid legs from totals. Straight-line
distance is never substituted into driving fields.

## Optimization constraints

Optimization is suggestion-only until an authorized office user accepts it.
Locked, completed, active, imminent, appointment-window, working-hour, and
provider-road constraints are preserved. Version checks prevent stale clients
from applying route changes.

## Privacy and authorization

Owner/admin/manager roles operate the office route workspace. Technicians read
only their own route through tenant-scoped RLS. Private technician home
coordinates and geometry touching a private endpoint are not stored in general
route-query records. Public booking, estimate, invoice, and customer token
clients have no route policies.

The immutable `route_audit_events` ledger records route lifecycle, stale state,
ordering, locking, assignments, optimization decisions, and endpoint changes.

## Accessibility and fallback

The map has a complete non-map dispatch board, ordered technician route panels,
text route colors/names, accessible marker labels, keyboard stop movement,
visible focus styles, textual warning severity, loading announcements, and
reduced-motion support. Provider failure never blocks assignment, status,
customer contact, schedule, or job navigation.

On narrow screens the map filters and route panels stack, controls retain touch
targets, and the technician `/tech/route` experience prioritizes the ordered
current-day route.

## Observability and troubleshooting

Server logs use tenant/record identifiers, provider, duration, safe error codes,
and operation stage. They must never contain credentials, private technician
origins, full customer addresses, or payment data.

- `REQUEST_DENIED` or HTTP 403: verify API restrictions and enabled API.
- HTTP 429: inspect quota/rate-limit alerts and retry after provider recovery.
- `route_plans.* does not exist`: apply Epic 7 migrations in timestamp order.
- stale route: recalculate after schedule/address/assignment changes.
- partial route: resolve the identified address/provider leg, then recalculate.
- no line on map: verify a ready/partial encoded road polyline was persisted.

## Deployment verification

1. Apply all timestamped migrations through
   `20260725000700_epic_7_checkpoint_18_route_audit_security.sql`.
2. Configure and restrict provider environment variables.
3. Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
4. Verify an office user can calculate/reorder/optimize a route.
5. Verify a technician sees only their own `/tech/route`.
6. Verify a user from another tenant and an anonymous token cannot query route
   records.
7. Verify provider outage leaves the non-map dispatch controls functional.

## Known limitations

Routes are planned estimates, not live GPS tracking or measured odometer
mileage. Traffic freshness depends on provider calculation time. Notification
delivery remains stubbed until its provider is configured. Optimization is
bounded and human-approved rather than a global fleet optimizer.
