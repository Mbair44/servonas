# Epic 7 Checkpoint 3 — Address Intelligence and Geocoding

Date: 2026-07-24

## Implemented architecture

The existing structured `service_locations` address remains authoritative user
input. Provider-normalized data is separate and never silently replaces those
fields. Google Place selection remains the preferred identity source.

`GeocodingProvider.resolveAddress()` is provider-neutral. The Google implementation
uses Place Details when a selected Place ID exists and the Geocoding API for a
structured-address fallback. The deterministic stub covers success, normalization,
ambiguity, partial matches, no results, provider failure, invalid coordinates,
Place ID, and structured-address tests.

## Persisted operational fields

`service_locations` contains only operationally useful routing information:

- formatted and normalized address;
- provider-neutral and Google-compatible place identity;
- nullable latitude/longitude;
- coordinate source;
- geocoding status;
- manual-override flag.

Assigned technicians can continue reading locations for their assigned jobs.
Internal fingerprints, attempts, provider errors, confidence, warnings, and manual
override actor metadata live in the office-only
`service_location_geocoding` table. Audit events live in the office-only
`service_location_geocoding_events` table.

No raw Google response is stored.

## Fingerprints and stale data

The fingerprint is SHA-256 over six structured components separated by an
unambiguous delimiter. Components are trimmed, repeated whitespace is collapsed,
case is normalized without punctuation-destroying transformations, optional empty
values are normalized, and common United States country names normalize to `US`.

When the fingerprint changes, the database:

- marks the location stale;
- clears coordinates and provider-normalized identity;
- clears any manual override;
- resets private resolution metadata;
- records a safe stale audit event.

Checkpoint 2 then marks affected non-archived route plans stale and advances their
versions. Historical `route_stops` snapshots are not changed.

Provider-only display normalization does not change user-entered fields and does
not invalidate routes when place identity and coordinates remain equivalent.

## Status definitions

- `not_requested`: no attempt has been made.
- `pending`: one server-side request owns the current resolution attempt.
- `verified`: a provider returned a complete normalized address and valid
  coordinates.
- `manual`: an authorized office user supplied valid routing coordinates.
- `stale`: the user-entered routing address changed or an override was cleared.
- `failed`: the request failed or had no usable result.
- `ambiguous`: multiple, partial, or incomplete candidates require review.

Confidence is `exact`, `high`, `medium`, `low`, or `unknown`. Google results are
only `exact` when the documented geometry type is `ROOFTOP`. A selected valid Place
ID is otherwise `high`; partial matches remain ambiguous/low.

## Caching, deduplication, and retry

`begin_service_location_geocoding()` locks the selected tenant-bound location and
atomically decides whether to resolve, reuse cache, preserve a manual override,
report an in-flight request, or enforce cooldown.

- Unchanged verified coordinates are reused.
- Pending requests are suppressed for two minutes.
- Explicit retries have a 30-second cooldown.
- Manual overrides are never overwritten by retry; they must first be cleared
  explicitly.
- Results are persisted only when the request fingerprint still matches the
  current address.

There is no bulk external backfill. Legacy coordinates are classified `legacy` and
stale, and unresolved locations continue to work in CRM, jobs, and scheduling.
A future backfill should process active locations in quota-aware batches with a
dry-run report and stop on quota exhaustion.

## Manual coordinates

Owner, admin, and manager roles can set or clear manual coordinates through
centralized RPCs. Coordinates are range-checked, the `0,0` unresolved placeholder
is rejected, actor/time are recorded privately, and route invalidation is triggered.
Technicians and public/customer flows cannot call these mutations.

## Security and privacy

- Resolution RPCs enforce tenant and office-role/service-role access.
- Internal tables have RLS and office-only select policies.
- Public roles receive no geocoding RPC grants.
- Logs include business ID, location ID, provider, status, duration, and safe error
  classification only.
- Logs exclude addresses, request URLs, API keys, raw payloads, and authorization
  headers.
- Public booking, estimate, invoice, and receipt queries do not receive private
  geocoding metadata.

## Google configuration

Existing names are retained:

- `GOOGLE_MAPS_API_KEY`: server-only Place Details and Geocoding key.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: browser Places autocomplete key.

The browser key must use production/preview HTTP-referrer restrictions and only
approved browser APIs. The server key must be restricted to Place Details and
Geocoding APIs and, where the deployment supports it, server egress IPs. Keys are
never returned by the server-side provider or logged.

## Migration and audit

Migration:
`supabase/migrations/20260724001100_epic_7_checkpoint_3_address_intelligence.sql`

Audit:
`supabase/audits/20260724001100_epic_7_checkpoint_3_address_audit.sql`

The migration performs no external calls and no production-scale geocoding. Run
the audit after migration; every `failing_rows` value must be zero, both internal
tables must have RLS enabled, and all listed constraints must be validated.

## Deferred

- Tenant office and private technician start/end address settings.
- Background bulk geocoding.
- Map-pin UI for manual overrides.
- Daily dispatch map, browser map rendering, Google Routes, route matrices,
  road-route calculations, ordering, and optimization.

Checkpoint 4 should begin only after the migration/audit results and Checkpoint 3
behavior are approved.

