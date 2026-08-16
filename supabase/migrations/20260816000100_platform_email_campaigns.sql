begin;

create table if not exists public.platform_email_campaigns(
 id uuid primary key default gen_random_uuid(),
 send_token uuid not null unique,
 subject text not null check(char_length(subject) between 1 and 160),
 body text not null check(char_length(body) between 1 and 5000),
 status text not null default 'sending' check(status in('sending','sent','partially_failed','failed')),
 recipient_count integer not null default 0 check(recipient_count>=0),
 sent_count integer not null default 0 check(sent_count>=0),
 skipped_count integer not null default 0 check(skipped_count>=0),
 failed_count integer not null default 0 check(failed_count>=0),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);

create table if not exists public.platform_email_recipients(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.platform_email_campaigns(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,
 business_name text not null,
 recipient_email text not null,
 tracking_token uuid not null default gen_random_uuid() unique,
 status text not null default 'queued' check(status in('queued','sent','skipped','failed')),
 provider_message_id text,
 error_message text,
 unsubscribed_at timestamptz,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(campaign_id,business_id)
);

create table if not exists public.platform_email_opt_outs(
 email text primary key,
 opted_out_at timestamptz not null default now(),
 recipient_id uuid references public.platform_email_recipients(id) on delete set null
);

create index if not exists platform_email_recipients_campaign_status_idx on public.platform_email_recipients(campaign_id,status);
create index if not exists platform_email_recipients_email_idx on public.platform_email_recipients(lower(recipient_email));

alter table public.platform_email_campaigns enable row level security;
alter table public.platform_email_recipients enable row level security;
alter table public.platform_email_opt_outs enable row level security;

notify pgrst,'reload schema';
commit;
