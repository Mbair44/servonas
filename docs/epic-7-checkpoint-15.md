# Epic 7 — Checkpoint 15: Service-routing readiness

This checkpoint adds generic field-service capabilities motivated by pest-control routing without introducing pest-specific tables or terminology.

## Route density

The dispatch page summarizes today’s concentration by ZIP code, city, service area, technician, appointment-window hour, and resolved job-duration band. These are operational counts only; they do not imply savings or optimization quality.

## Nonzero service duration

Route calculation now records and follows this fallback order:

1. job `estimated_duration_minutes`
2. service `duration_minutes`
3. active price-book item `estimated_duration_minutes`
4. business routing-policy default
5. documented 60-minute fallback

Zero is never silently used. Each route stop stores `service_duration_source` for audit.

Owners and administrators can configure the business fallback and imminent-job protection period under Business Settings.

## Recurrence and future constraints

`recurring_service_series` provides inactive-by-default readiness for day/week/month/year service cadences, due dates, customer/location/service association, appointment preferences, and routing requirements. It does not generate jobs.

Jobs and technician profiles have provider-neutral `routing_requirements` and `routing_capabilities`. Only supported keys containing actual data—skills, service areas, and boolean capabilities—are enforced. Empty or unknown future constraints do not produce invented restrictions.

Run `supabase/migrations/20260725000500_epic_7_checkpoint_15_service_routing_readiness.sql` after Checkpoint 13. Checkpoint 14 has no migration.
