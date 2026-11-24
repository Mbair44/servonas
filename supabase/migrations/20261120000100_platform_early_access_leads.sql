begin;

create table if not exists public.platform_early_access_leads(
 id uuid primary key default gen_random_uuid(),
 contact_name text not null check(char_length(contact_name) between 2 and 120),
 business_name text not null check(char_length(business_name) between 2 and 160),
 email text not null check(char_length(email) between 3 and 254),
 phone text,
 business_city text not null check(char_length(business_city) between 2 and 120),
 business_state text not null check(char_length(business_state) between 2 and 80),
 website_url text,
 current_software text not null check(current_software in('inflatable_office','event_rental_systems','booqable','goodshuffle_pro','spreadsheets_manual','no_software','other')),
 inventory_size text,
 biggest_challenge text,
 status text not null default 'new' check(status in('new','reviewing','contacted','interested','beta_invited','onboarding','converted','not_interested')),
 source text,
 utm_source text,
 utm_medium text,
 utm_campaign text,
 utm_content text,
 utm_term text,
 landing_page text not null default '/early-access',
 consent_version text not null,
 consent_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_contacted_at timestamptz,
 internal_notes text not null default ''
);

create unique index if not exists platform_early_access_leads_email_unique on public.platform_early_access_leads(lower(email));
create index if not exists platform_early_access_leads_status_created_idx on public.platform_early_access_leads(status,created_at desc);

create table if not exists public.platform_early_access_submission_limits(
 ip_hash text primary key,
 window_started_at timestamptz not null default now(),
 submission_count integer not null default 0 check(submission_count>=0),
 updated_at timestamptz not null default now()
);

alter table public.platform_early_access_leads enable row level security;
alter table public.platform_early_access_submission_limits enable row level security;

drop policy if exists "platform admins manage early access leads" on public.platform_early_access_leads;
create policy "platform admins manage early access leads" on public.platform_early_access_leads for all to authenticated using(public.is_servonas_platform_admin()) with check(public.is_servonas_platform_admin());

revoke all on table public.platform_early_access_leads from anon,authenticated;
grant select,insert,update,delete on table public.platform_early_access_leads to authenticated;
revoke all on table public.platform_early_access_submission_limits from anon,authenticated;

commit;
