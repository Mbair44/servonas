begin;

alter table public.booking_attribution_sessions
  add column if not exists first_interaction_type text,
  add column if not exists first_interaction_label text,
  add column if not exists first_interaction_identifier text,
  add column if not exists first_interaction_path text,
  add column if not exists first_interaction_at timestamptz,
  add column if not exists time_to_first_interaction_milliseconds bigint,
  add column if not exists meaningful_interaction_count integer not null default 0,
  add column if not exists automated_classification text not null default 'unknown' check (automated_classification in ('human_likely','automated_likely','unknown')),
  add column if not exists automated_classification_reason text;

create index if not exists booking_attribution_sessions_business_quality_idx
  on public.booking_attribution_sessions(business_id,last_seen_at desc,automated_classification,first_landing_path);

notify pgrst,'reload schema';
commit;
