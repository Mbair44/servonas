begin;

alter table public.website_acquisition_sessions
  add column if not exists visitor_id uuid,
  add column if not exists last_page_path text,
  add column if not exists exit_page text,
  add column if not exists first_meaningful_action text,
  add column if not exists first_meaningful_action_at timestamptz,
  add column if not exists time_to_first_action_ms bigint,
  add column if not exists meaningful_action_count integer not null default 0;

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
    'pricing_cta_clicked',
    'plan_selected',
    'demo_clicked',
    'demo_started',
    'demo_completed',
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
    'website_published',
    'session_heartbeat'
  ));

create index if not exists website_acquisition_sessions_visitor_seen_idx
  on public.website_acquisition_sessions(visitor_id, first_seen_at desc)
  where visitor_id is not null;

notify pgrst, 'reload schema';
commit;
