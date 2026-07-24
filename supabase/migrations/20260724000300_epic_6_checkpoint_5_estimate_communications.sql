-- Epic 6 Checkpoint 5: estimate-specific communication delivery ledger.
begin;

create table public.estimate_communication_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  estimate_id uuid not null,
  channel text not null default 'email' check (channel in ('email')),
  event_type text not null check (event_type in (
    'estimate_sent','estimate_viewed','estimate_accepted','estimate_declined',
    'estimate_expiring','estimate_expired','estimate_follow_up'
  )),
  version_number integer not null check (version_number > 0),
  status text not null default 'stubbed' check (status in ('stubbed','queued','sent','failed')),
  recipient_email text,
  subject text,
  message_body text,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (business_id,id),
  constraint estimate_communications_estimate_fk foreign key (business_id,estimate_id)
    references public.estimates(business_id,id) on delete restrict
);
create index estimate_communications_timeline_idx
  on public.estimate_communication_events(business_id,estimate_id,created_at desc);
create unique index estimate_communications_lifecycle_once
  on public.estimate_communication_events(estimate_id,channel,event_type,version_number);

alter table public.estimate_communication_events enable row level security;
create policy "financial office reads estimate communications"
  on public.estimate_communication_events for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']));
-- Application delivery writes use the server-only service role.

commit;
