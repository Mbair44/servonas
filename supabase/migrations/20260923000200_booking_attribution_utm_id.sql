-- Preserve the standard UTM campaign identifier as first-touch attribution.
alter table public.booking_attribution_sessions add column if not exists utm_id text;
alter table public.booking_attribution_snapshots add column if not exists utm_id text;
