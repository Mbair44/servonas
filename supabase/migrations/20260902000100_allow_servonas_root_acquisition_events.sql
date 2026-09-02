-- Root-site acquisition adds a signup-start milestone to the existing funnel.
alter table public.website_acquisition_events
  drop constraint if exists website_acquisition_events_event_name_check;

alter table public.website_acquisition_events
  add constraint website_acquisition_events_event_name_check
  check (event_name in (
    'marketing_landing_view',
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
    'servonas_signup_started',
    'servonas_signup_completed',
    'business_created',
    'website_published'
  ));
