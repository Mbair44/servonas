-- Backward-compatible structured fields for referral-style website leads.
-- Existing service-request forms continue to store their full address and leave these fields empty.
alter table public.website_service_requests
  add column if not exists service_zip text,
  add column if not exists lead_metadata jsonb not null default '{}'::jsonb;

alter table public.website_service_requests
  alter column service_address drop not null;

alter table public.website_service_requests
  drop constraint if exists website_service_requests_service_address_check;

alter table public.website_service_requests
  add constraint website_service_requests_service_address_check
    check (service_address is null or length(service_address) between 3 and 500),
  add constraint website_service_requests_service_zip_check
    check (service_zip is null or service_zip ~ '^[0-9]{5}(-[0-9]{4})?$');

comment on column public.website_service_requests.lead_metadata is 'Structured tenant-scoped public lead details, including referral consent evidence when applicable.';
notify pgrst, 'reload schema';
