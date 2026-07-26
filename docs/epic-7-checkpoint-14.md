# Epic 7 — Checkpoint 14: Technician daily route view

The existing technician mobile area now includes `/tech/route`.

It shows today’s business-local date, planned route map, plan version/update time, current stop, next stop, ordered stops, inbound road miles and duration, customer, address, appointment window, service, customer call action, job details, and status progression.

External navigation links are provided for Google Maps, Apple Maps, and Waze. Servonas does not provide turn-by-turn directions and the page explicitly identifies the route as planned—not live GPS tracking.

## Authorization and refresh

The page resolves the signed-in user’s active technician profile and relies on the existing technician-specific RLS for route plans, technician routes, stops, legs, and assigned jobs. It does not use the service-role client and never queries private endpoint configuration.

Dispatcher changes appear after a normal refresh. The displayed plan version and update time make the snapshot clear. Status actions return to the route page and revalidate both technician screens.

Map loading, missing configuration, no-route days, and provider/network failures retain the ordered text route and job links as a graceful fallback.

No database migration is required for Checkpoint 14.
