-- Idempotent registration-expiration email delivery ledger.
begin;
create table if not exists public.fleet_registration_notification_events(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 asset_id uuid not null,registration_expires_on date not null,days_before integer not null check(days_before in(30,14,7,0)),
 recipient_email text not null,status text not null default 'pending' check(status in('pending','sent','failed')),
 provider_message_id text,error_message text,created_at timestamptz not null default now(),sent_at timestamptz,
 foreign key(business_id,asset_id) references public.workforce_assets(business_id,id) on delete cascade,
 unique(asset_id,registration_expires_on,days_before,recipient_email)
);
create index if not exists fleet_registration_events_business_idx on public.fleet_registration_notification_events(business_id,created_at desc);
alter table public.fleet_registration_notification_events enable row level security;
create policy "owners read fleet registration notices" on public.fleet_registration_notification_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));
notify pgrst, 'reload schema';
commit;
