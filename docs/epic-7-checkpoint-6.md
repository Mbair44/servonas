# Epic 7 Checkpoint 6 — Actual Road Route Calculation

## Configuration

Set these server-side environment variables:

```text
ROUTING_PROVIDER=google
GOOGLE_ROUTES_API_KEY=<server-restricted Google Routes API key>
```

`GOOGLE_ROUTES_API_KEY` must remain server-only. Restrict it in Google Cloud to
the Routes API and the deployed server environment. Do not reuse or expose the
browser map key.

## Operation

An authorized dispatcher requests calculation from the daily Dispatch page.
The server groups scheduled jobs by technician, verifies trusted coordinates,
calls Google Routes, and stores encoded road geometry and authoritative
distance-in-meters/duration-in-seconds for each leg and route.

The calculation uses a SHA-256 signature of provider, mode, ordered
coordinates, appointment times, and service duration. A ready route with an
unchanged signature is reused without another provider request.

Changes to assignments, schedules, locations, or coordinates continue to mark
the affected daily plan stale through the Checkpoint 2 triggers.

## Cost and reliability safeguards

- Calculations occur only after an explicit dispatcher request.
- Unchanged ready routes are cached.
- Technician routes are calculated sequentially to avoid request bursts.
- Requests have a 20-second timeout.
- Invalid/unverified stops never generate paid route requests.
- Routes above 25 intermediate waypoints are not sent; Checkpoint 7 will add
  safe segmentation.
- Provider failures retain the schedule and assignment experience and are
  recorded as failed or partial without straight-line substitution.

Google pricing and quotas are account- and region-dependent. Configure a Routes
API budget alert, request quota, and billing alert in Google Cloud before
production rollout.
