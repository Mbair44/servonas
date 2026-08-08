begin;

create table if not exists public.customer_campaigns(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 160),channel text not null check(channel in('email','sms')),
 subject text,body text not null check(char_length(body) between 1 and 5000),status text not null default 'draft' check(status in('draft','sending','sent','partially_failed','failed','canceled')),
 recipient_count integer not null default 0,sent_count integer not null default 0,delivered_count integer not null default 0,opened_count integer not null default 0,clicked_count integer not null default 0,failed_count integer not null default 0,skipped_count integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,updated_at timestamptz not null default now(),
 unique(business_id,id),check(channel<>'email' or nullif(btrim(subject),'') is not null)
);
create index if not exists customer_campaigns_business_created_idx on public.customer_campaigns(business_id,created_at desc);

create table if not exists public.customer_campaign_recipients(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null,customer_id uuid not null,recipient_address text,status text not null default 'queued' check(status in('queued','sent','delivered','failed','skipped')),
 provider text,provider_message_id text,tracking_token uuid not null default gen_random_uuid(),tracked_url text,error_message text,
 sent_at timestamptz,delivered_at timestamptz,opened_at timestamptz,clicked_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(campaign_id,customer_id),unique(tracking_token),foreign key(business_id,campaign_id) references public.customer_campaigns(business_id,id) on delete cascade,
 foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade
);
create index if not exists customer_campaign_recipients_campaign_status_idx on public.customer_campaign_recipients(business_id,campaign_id,status);
create unique index if not exists customer_campaign_recipients_provider_id_unique on public.customer_campaign_recipients(provider,provider_message_id) where provider_message_id is not null;

alter table public.customer_campaigns enable row level security;
alter table public.customer_campaign_recipients enable row level security;
create policy "members read customer campaigns" on public.customer_campaigns for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage customer campaigns" on public.customer_campaigns for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read campaign recipients" on public.customer_campaign_recipients for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage campaign recipients" on public.customer_campaign_recipients for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));

commit;
