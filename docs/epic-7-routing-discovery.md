# Epic 7 — Smart Dispatch and Route Optimization Discovery

Date: 2026-07-24

Status: architecture and provider recommendation only. No Epic 7 production code or
database migration has been created. Implementation must wait for approval.

## Recommendation

Use Google Maps Platform for the first routing provider:

- Maps JavaScript API for the office dispatch map.
- Routes API `computeRoutes` for road geometry, per-leg driving distance, and
  driving duration.
- Routes API `computeRouteMatrix` when comparing candidate technician/job
  assignments.
- Routes API waypoint optimization for the first single-technician route
  suggestions.
- The existing Google Places integration and stored Place IDs/coordinates for
  service-location geocoding.
- Route Optimization API only when the product needs constraints that cannot be
  represented safely by single-route waypoint optimization.

Google is the lowest integration-risk choice because Servonas already verifies
addresses with Google Places and stores Google Place IDs and coordinates. It also
provides one coherent source for map rendering, road geometry, route legs, traffic
options, and future constrained optimization.

The application must depend on provider-neutral interfaces, not Google response
objects. A future Mapbox provider should be possible without changing dispatch
domain models or UI components.

Servonas must never display a straight-line calculation as driving distance or
driving time. If the routing provider is unavailable, those metrics are unavailable.
The current schedule and dispatch list remain usable.

## Existing architecture

### Dispatch and scheduling

- `app/app/[businessSlug]/dispatch/page.tsx` is a server-rendered dispatch board
  organized into an unassigned column and technician columns. It supports date
  selection, assignment, status changes, conflict indicators, customer calls, and
  external directions links. It has no embedded map.
- `app/app/[businessSlug]/dispatch/actions.ts` validates business membership,
  technician eligibility, off-duty periods, and schedule conflicts. Assignment uses
  the `set_job_primary_technician` database RPC. Epic 7 must call this operation and
  must not write either assignment representation independently.
- `app/app/[businessSlug]/schedule/page.tsx` provides day, week, and month schedule
  views in the business time zone. Route planning must enhance it without making
  route data a prerequisite for scheduling.
- `lib/dispatchBoard.ts` detects appointment overlaps. It does not calculate travel
  or route feasibility.

### Assignment source of truth

The active primary `job_assignments` record is authoritative.
`jobs.assigned_technician_id` is a compatibility mirror. The existing centralized
RPC synchronizes both atomically. Epic 7 route suggestions may propose assignment
changes, but accepting a suggestion must use the same RPC and then invalidate the
affected route plan.

### Address and coordinate data

- `service_locations` contains a verified address, `google_place_id`, `latitude`,
  and `longitude`.
- `lib/googleAddress.ts` uses server-side Google Place Details and the
  `GOOGLE_MAPS_API_KEY`.
- The browser autocomplete integration uses
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Jobs can retain a free-text `service_address` for compatibility. Those jobs may
  not have routing-quality coordinates.

The current data does not distinguish pending, verified, failed, and stale
geocoding. It also lacks structured office/technician route origins and destination
settings.

### Authorization

- Owner, admin, and manager roles have operational dispatch access.
- Ordinary technicians use technician routes and are limited through
  `is_assigned_technician`-based policies to assigned work.
- Epic 7 must not grant technicians business-wide customer, job, route, or location
  access. A technician may read only their route and the stops/legs needed for their
  assigned jobs.
- No route-planning tables should have anonymous/public policies. Provider writes
  should be performed by trusted server code.

### Notifications

`lib/communications/jobNotificationService.ts` already centralizes audited email
and SMS behavior. Route assignment and route-change notifications should extend
this architecture. Epic 7 should not add a second notification stack.

## Provider review and cost model

Prices below are public list prices observed on 2026-07-24. They can change and
must be checked again before production launch. Free thresholds are billing-account
or SKU usage thresholds, not a budget guarantee.

### Google Maps Platform

Relevant global list-price tiers:

| SKU | Free monthly threshold | First paid tier |
| --- | ---: | ---: |
| Dynamic Maps | 10,000 map loads | $7.00 / 1,000 |
| Compute Routes Essentials | 10,000 requests | $5.00 / 1,000 |
| Compute Route Matrix Essentials | 10,000 elements | $5.00 / 1,000 |
| Compute Routes Pro | 5,000 requests | $10.00 / 1,000 |
| Compute Route Matrix Pro | 5,000 elements | $10.00 / 1,000 |
| Route Optimization — Single Vehicle | 5,000 requests | $10.00 / 1,000 |
| Route Optimization — Fleet Routing | 1,000 requests | $30.00 / 1,000 |
| Geocoding | 10,000 requests | $5.00 / 1,000 |

`computeRoutes` supports up to 25 intermediate waypoints. Requests with 11–25
intermediate waypoints are billed at a higher tier. Therefore long technician days
must be rejected or deliberately partitioned; they must not silently produce a
partial route. Route Matrix is billed per matrix element, so broad all-technician
comparisons can grow quadratically.

Illustrative monthly baseline: 100 businesses × 10 technician routes per workday ×
22 workdays equals 22,000 route calculations. At the first Essentials tier, after
the 10,000 free threshold, route calls alone would be about $60/month. Map loads,
matrix elements, optimization, retries, and recalculations are additional. This is
an estimate, not a quote.

### Mapbox alternative

Mapbox Directions and Optimization currently include 100,000 requests/month, then
start at $2.00/1,000. Matrix includes 100,000 elements/month, then starts at
$2.00/1,000. Mapbox GL JS includes 50,000 web map loads/month, then starts at
$5.00/1,000. Directions supports up to 25 coordinates; Matrix supports up to 625
elements (25 × 25).

Mapbox is a credible lower-list-price alternative and should be the first provider
implemented after Google if cost or contractual requirements justify it. Choosing
it now would add an address-provider reconciliation problem because existing
verified locations are Google Place based.

### Provider operational requirements

- Enable billing and only the required APIs.
- Use a browser key restricted by production/preview HTTP referrers and limited to
  Maps JavaScript/required browser APIs.
- Use server-only keys restricted to the required server APIs and, where supported,
  server egress IPs.
- Add a dedicated `GOOGLE_ROUTES_API_KEY`; do not increase the permissions of the
  existing Places key merely for convenience.
- Add `ROUTING_PROVIDER=google`; provider selection must be server-side.
- Set per-minute and daily quotas, billing alerts, request timeouts, retry limits,
  and a per-business recalculation throttle.
- Never expose server routing keys or complete provider error payloads to the
  browser.
- Confirm contractual storage, display, attribution, and retention requirements
  before persisting provider geometry in production. Keep provider provenance and
  calculation timestamps on every persisted result.

## Proposed provider-neutral application boundary

Create interfaces approximately shaped as:

- `GeocodingProvider.geocode(address)` → normalized address, coordinates,
  confidence/status, provider reference.
- `RoutingProvider.computeRoute(request)` → encoded geometry, totals, ordered
  provider-neutral legs, warnings, provider metadata.
- `RoutingProvider.computeMatrix(request)` → origin/destination cells with road
  distance, duration, and per-cell status.
- `RouteOptimizationProvider.suggest(request)` → ordered stop IDs, totals,
  constraint violations, and an explanation/audit summary.

Provider adapters belong on the server. They should validate input/output, use
timeouts and bounded retries, and translate failures into stable domain errors.
React components and server actions must not import Google SDK response types.

## Proposed database migration

Use `business_id` consistently with the current tenant model. All tenant-owned
foreign keys should be composite where practical so a child cannot reference a row
from another business.

### `route_plans`

One versioned plan per business/service date:

- business, service date, business time-zone snapshot, version, status
- calculation status (`not_calculated`, `queued`, `calculating`, `ready`,
  `partial`, `failed`, `stale`)
- provider, input signature, total distance/duration, calculated/error timestamps
- created/updated actor and timestamps

Unique active plan key: `(business_id, service_date)`. Version changes provide
optimistic concurrency protection for planner edits and calculation results.

### `technician_routes`

One route per technician inside a plan:

- business, plan, technician, route status, provider
- origin/destination types and immutable address/coordinate snapshots
- total distance, travel duration, service duration
- encoded route geometry, provider route reference, input signature
- calculation/staleness timestamps and sanitized error category

Unique keys: `(business_id, route_plan_id, technician_id)` and composite identifiers
required by child foreign keys.

### `route_stops`

Persist the planned stop sequence:

- business, technician route, job, service location
- sequence, state, planned arrival/departure
- appointment window and service-duration snapshots
- address and coordinate snapshots
- geocoding status/provider/reference
- locked-position/manual override flags

Unique keys: one job per active plan and one sequence per technician route.
Coordinate snapshots prevent historical routes from changing when a customer
address is edited.

### `route_legs`

Persist actual provider-returned road legs:

- business, technician route, sequence
- origin/destination kind and nullable stop references
- provider, road distance meters, base/traffic-aware duration seconds
- encoded leg geometry, calculation timestamp, input signature
- leg status and sanitized warning/error category

Distance and duration are nullable. They must never be filled with straight-line
fallbacks.

### `route_optimization_runs`

Audit every optimization request:

- business, plan, requested/started/completed timestamps, actor
- algorithm/provider, status, version/input signature
- immutable constraint summary, before/after totals
- sanitized failure category and provider request reference

### `route_suggestions`

Store reviewable changes instead of mutating jobs immediately:

- optimization run, suggestion type, technician/job
- before/after sequence or assignment, estimated impact, reason
- status (`pending`, `accepted`, `rejected`, `superseded`)
- review actor/time

Accepting assignment suggestions must use `set_job_primary_technician`.

### Route settings and geocoding state

Add `business_route_settings` for office/depot start and end locations, planning
defaults, and provider-neutral constraints. Add `technician_route_settings` for
optional per-technician starts/ends. Technician home coordinates are sensitive and
must not be added to generally readable profile data.

Add structured geocoding state to route-capable addresses: status, provider,
provider reference, last verified/calculated time, and a hash of the normalized
source address. An address edit invalidates the previous coordinates until the new
address is verified.

### Constraints, triggers, and RLS

- Nonnegative checks for all durations/distances and valid sequence numbers.
- Composite tenant foreign keys for plans, routes, stops, jobs, technicians, and
  locations.
- A trigger marks affected route plans stale when appointment time, duration,
  service location, coordinate, status, or primary assignment changes.
- Database functions reject cross-tenant route content and stale-version writes.
- Owner/admin/manager can manage routing data.
- A technician can read their own route and only stops/legs for jobs assigned to
  them.
- Public/anonymous users receive no routing policies.
- Sensitive route settings are office-role-only.

Migration SQL must include preflight duplicate/orphan audits and must use
`NOT VALID` for new composite foreign keys over existing data until audits are
clean. Every such constraint needs a documented validation query.

## Compatibility and failure behavior

- Existing dispatch, schedule, job, and assignment pages continue working when no
  route plan exists.
- Calculation is asynchronous from the user's perspective: save schedule changes,
  mark the plan stale, then calculate/recalculate without holding a form request
  open.
- A provider outage produces an explicit unavailable/failed/partial state. It never
  blocks ordinary scheduling or invents driving metrics.
- Valid legs remain visible during partial failures and failed stops identify the
  actionable address or provider problem without leaking provider credentials.
- Applying a suggestion rechecks plan version, current job data, technician access,
  assignment eligibility, and conflicts in one server-side operation.
- Old route results cannot overwrite a newer plan because both input signature and
  plan version must match.

## Checkpoint implementation plan

1. **Architecture/provider decision** — this document; approval gate.
2. **Domain foundation** — provider-neutral types, validation, migration, RLS,
   audits, and stale-state mechanics.
3. **Geocoding readiness** — address status, office/technician route settings,
   backfill/audit, and repair UI.
4. **Routing adapter** — authenticated Google Routes server client, request
   budgets, timeouts, normalized errors, fixtures, and contract tests.
5. **Single-technician calculation** — persisted routes/stops/legs using actual
   road results and deterministic input signatures.
6. **Dispatch map shell** — accessible responsive Google map beside the existing
   dispatch list with empty/loading/error states.
7. **Route visualization** — technician colors, markers, polylines, selection
   synchronization, and fit-bounds behavior.
8. **Per-leg intelligence** — travel time/distance and arrival estimates derived
   only from persisted provider results.
9. **Feasibility warnings** — late-arrival, overlap, missing-coordinate, long-gap,
   and route-stale warnings without automatic mutation.
10. **Manual route editing** — reorder, assign, and unassign through existing
    authorization and assignment operations.
11. **Recalculation orchestration** — coalescing, stale guards, retries, partial
    results, and provider outage behavior.
12. **Optimization suggestions** — single-vehicle suggestions first; preview and
    audit without immediate changes.
13. **Suggestion acceptance** — versioned atomic application through centralized
    assignment/scheduling operations.
14. **Multi-technician comparison** — bounded matrix calls and assignment
    recommendations with strict cost controls.
15. **Technician route view** — own-route-only mobile view; no live tracking.
16. **Notifications** — reuse communication services for accepted assignment and
    materially changed route notifications.
17. **Performance/cost controls** — cache/signature reuse, quotas, observability,
    pagination, and geometry payload controls.
18. **Accessibility/responsiveness** — keyboard/list alternative, contrast, focus,
    screen-reader labels, and map-independent task completion.
19. **Security/reliability review** — cross-tenant tests, sensitive origin privacy,
    stale-write tests, provider error redaction, and rate-abuse tests.
20. **Production verification** — migration audit/application, provider smoke
    tests, complete dispatch flows, build, lint, type-check, and rollout/runbook.

Each checkpoint remains independently reviewable and must stop for approval before
the next checkpoint, as required by the Epic.

## Primary risks

1. **Provider cost amplification:** matrix calls, recalculation loops, and long
   optimized routes can change SKUs or grow quadratically.
2. **Provider contractual restrictions:** persisted coordinates/geometry and map
   display must be reviewed against the production account's current terms.
3. **Stale calculations:** schedule, assignment, or address edits can race route
   responses; version/signature guards are mandatory.
4. **Coordinate quality:** legacy free-text job addresses need an explicit
   unroutable state and repair flow.
5. **Server runtime limits:** large optimization work should use a durable
   background execution mechanism rather than a long Vercel request.
6. **Privacy:** technician home/depot origins are more sensitive than ordinary
   dispatch data.
7. **Time zones and DST:** planning dates use the business time zone while stored
   instants remain UTC.
8. **Role leakage:** routing joins must not widen ordinary technician access to all
   customers/jobs.
9. **Waypoint limits:** long days need a product rule or deliberate partitioning
   strategy.
10. **Map accessibility:** every map action needs an equivalent usable list/control
    path.

## Approval decision

Approval should explicitly cover:

- Google Maps Platform as the initial provider.
- The proposed provider-neutral boundary and dedicated server routing key.
- The proposed migration/domain model and RLS direction.
- Beginning Checkpoint 2 only; later checkpoints retain their approval gates.

