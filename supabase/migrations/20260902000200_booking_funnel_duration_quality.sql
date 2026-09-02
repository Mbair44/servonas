begin;

alter table public.booking_attribution_sessions
  add column if not exists total_session_duration_milliseconds bigint,
  add column if not exists engaged_duration_milliseconds bigint,
  add column if not exists duration_source text,
  add column if not exists duration_final_flush_received boolean not null default false,
  add column if not exists duration_last_flush_reason text;

-- Existing positive integer durations are safe to convert. A historic zero could
-- be either a real quick exit or a missing final write, so it stays unknown.
update public.booking_attribution_sessions
set total_session_duration_milliseconds = total_session_duration_seconds * 1000,
    engaged_duration_milliseconds = engaged_duration_seconds * 1000,
    duration_source = coalesce(duration_source, 'heartbeat')
where total_session_duration_seconds > 0
  and total_session_duration_milliseconds is null;

create index if not exists booking_attribution_sessions_business_duration_quality_idx
  on public.booking_attribution_sessions(business_id,last_seen_at desc,duration_final_flush_received);

notify pgrst,'reload schema';
commit;
