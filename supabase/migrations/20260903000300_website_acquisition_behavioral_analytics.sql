begin;

alter table public.website_acquisition_sessions
  add column if not exists active_duration_ms bigint,
  add column if not exists timing_available boolean not null default false,
  add column if not exists final_flush_received boolean not null default false,
  add column if not exists duration_source text,
  add column if not exists duration_last_flush_reason text,
  add column if not exists last_active_at timestamptz;

alter table public.website_acquisition_events
  drop constraint if exists website_acquisition_events_event_name_check;

alter table public.website_acquisition_events
  add constraint website_acquisition_events_event_name_check
  check (event_name in (
    'marketing_landing_view',
    'page_viewed',
    'scroll_depth_reached',
    'primary_cta_clicked',
    'secondary_cta_clicked',
    'pricing_viewed',
    'demo_clicked',
    'demo_started',
    'website_builder_started',
    'website_builder_step1_started',
    'website_builder_step1_completed',
    'website_builder_validation_error',
    'domain_option_selected',
    'domain_availability_checked',
    'domain_available',
    'domain_unavailable',
    'website_builder_style_viewed',
    'website_builder_style_selected',
    'website_preview_generation_started',
    'website_preview_generated',
    'website_preview_generation_failed',
    'website_preview_viewed',
    'website_creation_celebration_shown',
    'website_builder_account_prompt_viewed',
    'website_builder_account_created',
    'website_builder_claimed',
    'signup_started',
    'signup_completed',
    'servonas_signup_started',
    'servonas_signup_completed',
    'builder_started',
    'builder_step_completed',
    'preview_opened',
    'business_created',
    'website_published'
  ));

create index if not exists website_acquisition_sessions_industry_duration_idx
  on public.website_acquisition_sessions(industry, last_seen_at desc, final_flush_received, timing_available);

notify pgrst, 'reload schema';
commit;
