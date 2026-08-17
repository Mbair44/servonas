-- First-party acquisition analytics for Servonas website-builder prospects.
create table if not exists public.website_acquisition_sessions (
  id uuid primary key,
  industry text not null,
  first_landing_path text,
  first_landing_url text,
  first_referrer text,
  gclid text, gbraid text, wbraid text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  device_category text,
  user_id uuid references auth.users(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.website_acquisition_events (
  id uuid primary key default gen_random_uuid(),
  acquisition_session_id uuid not null references public.website_acquisition_sessions(id) on delete cascade,
  industry text not null,
  user_id uuid references auth.users(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  event_name text not null check (event_name in ('marketing_landing_view','website_builder_started','website_builder_step1_started','website_builder_step1_completed','website_builder_validation_error','domain_option_selected','domain_availability_checked','domain_available','domain_unavailable','website_builder_style_viewed','website_builder_style_selected','website_preview_generation_started','website_preview_generated','website_preview_generation_failed','website_preview_viewed','servonas_signup_completed','business_created','website_published')),
  event_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists website_acquisition_sessions_industry_seen_idx on public.website_acquisition_sessions(industry, first_seen_at desc);
create index if not exists website_acquisition_events_industry_event_idx on public.website_acquisition_events(industry,event_name,occurred_at desc);
create index if not exists website_acquisition_events_business_idx on public.website_acquisition_events(business_id,event_name);
alter table public.website_acquisition_sessions enable row level security;
alter table public.website_acquisition_events enable row level security;
