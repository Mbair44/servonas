begin;

create table if not exists public.meta_conversion_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  pixel_id text not null check (pixel_id ~ '^[0-9]{8,24}$'),
  event_name text not null check (event_name in ('InitiateCheckout','Purchase','ViewContent')),
  event_id text not null check (length(event_id) between 20 and 110),
  event_source_url text,
  status text not null check (status in ('pending','sent','failed','configuration_missing')),
  last_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  http_status integer,
  error_code text,
  error_message text,
  provider_trace_id text,
  response_events_received integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,event_name,event_id)
);

create index if not exists meta_conversion_events_business_created_idx
  on public.meta_conversion_events(business_id,created_at desc);

alter table public.meta_conversion_events enable row level security;
revoke all on public.meta_conversion_events from anon, authenticated;

comment on table public.meta_conversion_events is
  'Server-side Meta Conversions API delivery ledger for event_id deduplication between browser Pixel and CAPI events.';

commit;
