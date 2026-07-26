# Epic 7 — Checkpoint 13: Technician start and end locations

Business Settings now supports tenant defaults and per-technician overrides for:

- office
- technician home
- custom address
- first/last job
- no origin/destination

## Privacy model

Private home configuration lives in `technician_route_endpoint_overrides`, not the broadly readable technician profile. Its RLS policies permit only business owners, administrators, and the server service role. Ordinary managers, staff, technicians, and general route queries cannot read it.

Home data is stored only when an owner/admin explicitly selects a home route mode. Switching away clears its address and coordinates. A non-sensitive label is stored separately.

The server resolves private coordinates only in memory while calling the routing provider. `technician_routes` stores `origin_is_private` or `destination_is_private`, a generic private label, and null address/coordinate fields. Geometry for private endpoint legs and the full route polyline is not persisted because it could reveal the private coordinates. Route legs retain endpoint type and road metrics but no home location. Logs use IDs and error codes, never full private addresses.

## Routing behavior

Route calculation includes configured endpoints in provider road distance, duration, geometry, and legs. Missing required verified coordinates causes a clear endpoint-configuration failure instead of silently reverting to a different origin.

Endpoint changes mark existing plans stale. Optimization suggestions are conservatively skipped for endpoint-aware routes until endpoint-preserving optimization is introduced, preventing invalid savings comparisons.

Run `supabase/migrations/20260725000400_epic_7_checkpoint_13_route_endpoints.sql` after Checkpoint 12.
