begin;
alter table public.delivery_fee_settings
 drop constraint if exists delivery_fee_settings_pricing_method_check;
alter table public.delivery_fee_settings
 add constraint delivery_fee_settings_pricing_method_check check(pricing_method in ('distance_tiers','per_mile','time_tiers')),
 add column if not exists time_tiers jsonb not null default '[{"upToMinutes":20,"feeCents":0},{"upToMinutes":30,"feeCents":2500}]'::jsonb check(jsonb_typeof(time_tiers)='array'),
 add column if not exists maximum_drive_minutes numeric(8,2) check(maximum_drive_minutes is null or maximum_drive_minutes>0);
notify pgrst,'reload schema';
commit;
