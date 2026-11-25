begin;
alter table public.platform_early_access_leads alter column business_city drop not null;
alter table public.platform_early_access_leads alter column business_state drop not null;
commit;
