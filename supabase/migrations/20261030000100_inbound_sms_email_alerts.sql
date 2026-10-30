begin;

alter table public.business_inbound_sms_settings
 add column if not exists email_alerts_enabled boolean not null default false;

notify pgrst, 'reload schema';
commit;
