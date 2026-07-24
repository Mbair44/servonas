# Epic 7 Checkpoint 5 — Technician Route Panels

The daily dispatch map now includes an expandable route panel for every technician with scheduled work.

## Behavior

- Selecting a technician card filters and focuses that technician's route.
- Selecting a mapped stop centers the map, opens its marker details, and highlights the corresponding stop row.
- Route stops use persisted `route_stops.sequence` when a calculated route exists, with scheduled order as the pre-calculation fallback.
- ETA, prior-leg driving distance, prior-leg driving duration, and route totals are displayed only when authoritative persisted routing values exist.
- Pending route calculations are labeled as pending; straight-line estimates are never presented as driving metrics.
- Private technician route endpoints display a generic private label and never expose home addresses or coordinates.
- Schedule conflicts, locked stops, unmappable addresses, and failed/stale routes are surfaced as warnings.

## Database changes

None. Checkpoint 5 reads the routing schema introduced in Checkpoint 2.

## Deferred

Route calculation and recalculation controls remain part of Checkpoint 6.
