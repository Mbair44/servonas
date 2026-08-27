begin;

alter table public.business_website_onboarding_states
 drop constraint if exists business_website_onboarding_domain_request_status_check;
alter table public.business_website_onboarding_states
 add constraint business_website_onboarding_domain_request_status_check
 check(domain_request_status is null or domain_request_status in(
  'requested',
  'availability_check_needed',
  'available',
  'premium_review',
  'approved',
  'registration_pending',
  'purchased',
  'registered',
  'connected',
  'unavailable',
  'failed'
 ));

notify pgrst,'reload schema';
commit;
