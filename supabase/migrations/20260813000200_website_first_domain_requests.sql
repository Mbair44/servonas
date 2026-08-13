begin;

alter table public.business_website_onboarding_states
 add column if not exists requested_domain text,
 add column if not exists domain_request_status text,
 add column if not exists domain_requested_at timestamptz;

alter table public.business_website_onboarding_states
 drop constraint if exists business_website_onboarding_requested_domain_check;
alter table public.business_website_onboarding_states
 add constraint business_website_onboarding_requested_domain_check
 check(requested_domain is null or (length(requested_domain) between 3 and 253 and requested_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'));

alter table public.business_website_onboarding_states
 drop constraint if exists business_website_onboarding_domain_request_status_check;
alter table public.business_website_onboarding_states
 add constraint business_website_onboarding_domain_request_status_check
 check(domain_request_status is null or domain_request_status in('requested','availability_check_needed','approved','purchased','connected','unavailable'));

create index if not exists business_website_domain_requests_pending_idx
 on public.business_website_onboarding_states(domain_request_status,domain_requested_at)
 where requested_domain is not null;

comment on column public.business_website_onboarding_states.requested_domain is
 'Pilot customer domain preference awaiting manual availability confirmation; this is not a registered custom domain.';
comment on column public.business_website_onboarding_states.domain_request_status is
 'Manual pilot fulfillment status. It never represents registrar availability without staff confirmation.';

notify pgrst,'reload schema';
commit;
