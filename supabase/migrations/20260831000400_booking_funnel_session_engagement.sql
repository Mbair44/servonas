begin;

alter table public.booking_attribution_sessions
  add column if not exists session_started_at timestamptz not null default now(),
  add column if not exists session_ended_at timestamptz,
  add column if not exists entry_path text,
  add column if not exists last_path text,
  add column if not exists entry_page_type text,
  add column if not exists last_page_type text,
  add column if not exists page_count integer not null default 0,
  add column if not exists engaged_page_count integer not null default 0,
  add column if not exists total_session_duration_seconds integer not null default 0,
  add column if not exists engaged_duration_seconds integer not null default 0;

create index if not exists booking_attribution_sessions_business_duration_idx
  on public.booking_attribution_sessions(business_id,last_seen_at desc,total_session_duration_seconds desc);

notify pgrst,'reload schema';
commit;
