begin;

create table if not exists public.business_notifications(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null,
  category text not null check(category in('reviews','marketing','customers','payments','system')),
  title text not null,
  body text not null default '',
  status text not null default 'unread' check(status in('unread','read','resolved','dismissed')),
  priority text not null default 'normal' check(priority in('info','normal','important','urgent')),
  action_label text,
  action_url text,
  external_resource_id text,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,dedupe_key)
);
create index if not exists business_notifications_inbox_idx on public.business_notifications(business_id,status,created_at desc);

create table if not exists public.business_notification_preferences(
  business_id uuid primary key references public.businesses(id) on delete cascade,
  google_reviews_enabled boolean not null default true,
  marketing_enabled boolean not null default true,
  payments_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.business_notifications enable row level security;
alter table public.business_notification_preferences enable row level security;
create policy "members read business notifications" on public.business_notifications for select to authenticated using(public.is_business_member(business_id));
create policy "members read business notification preferences" on public.business_notification_preferences for select to authenticated using(public.is_business_member(business_id));
create policy "managers update business notification preferences" on public.business_notification_preferences for update to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "managers insert business notification preferences" on public.business_notification_preferences for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin']));

notify pgrst,'reload schema';
commit;
