-- Customer Merge V1 / PR 1: lifecycle, immutable audit, canonical identity,
-- and contact-channel preservation. This migration intentionally does not
-- move operational or financial rows; that happens only in the PR 2 RPC.
begin;

alter table public.customers
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null,
  add column if not exists merge_version bigint not null default 1 check(merge_version > 0);

-- The legacy SMS-only merge predates merged_at. Its already-soft-deleted rows
-- remain valid history after being backfilled from their last mutation time.
update public.customers
set merged_at=coalesce(merged_at,updated_at,created_at),
    merged_by=coalesce(merged_by,updated_by)
where merged_into_customer_id is not null and merged_at is null;

alter table public.customers drop constraint if exists customers_merge_lifecycle_check;
alter table public.customers add constraint customers_merge_lifecycle_check check (
  merged_into_customer_id is null
  or (is_deleted = true and is_active = false and merged_at is not null)
);

-- A customer may have several contact channels after a merge. Consent belongs
-- to the exact normalized channel, never to a different email or phone.
create table if not exists public.customer_contact_channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  channel_type text not null check(channel_type in ('email','phone')),
  normalized_value text not null,
  display_value text not null,
  consent_status text not null default 'unknown'
    check(consent_status in ('unknown','subscribed','unsubscribed','inbound_contact','express','opted_out')),
  consent_recorded_at timestamptz,
  consent_source text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique(business_id,id),
  unique(business_id,customer_id,channel_type,normalized_value),
  foreign key(business_id,customer_id) references public.customers(business_id,id) on delete restrict,
  check(
    (channel_type = 'email' and normalized_value = lower(btrim(normalized_value)))
    or (channel_type = 'phone' and normalized_value ~ '^\+[1-9][0-9]{7,14}$')
  )
);
create unique index if not exists customer_contact_channels_one_primary_idx
  on public.customer_contact_channels(business_id,customer_id,channel_type)
  where is_primary and is_active;
create index if not exists customer_contact_channels_lookup_idx
  on public.customer_contact_channels(business_id,channel_type,normalized_value)
  where is_active;

-- Seed known profile channels once. A future merge retains these rows instead
-- of collapsing a second email/phone into the primary profile columns.
insert into public.customer_contact_channels(
  business_id,customer_id,channel_type,normalized_value,display_value,
  consent_status,consent_recorded_at,consent_source,is_primary,is_active,
  created_at,updated_at,created_by,updated_by
)
select business_id,id,'email',lower(btrim(email)),email,
  case when marketing_email_status='unsubscribed' then 'unsubscribed' else 'subscribed' end,
  marketing_email_opted_out_at,case when marketing_email_status='unsubscribed' then 'customer_profile' else null end,
  true,true,created_at,updated_at,created_by,updated_by
from public.customers where nullif(btrim(email),'') is not null
on conflict(business_id,customer_id,channel_type,normalized_value) do nothing;

insert into public.customer_contact_channels(
  business_id,customer_id,channel_type,normalized_value,display_value,
  consent_status,consent_recorded_at,consent_source,is_primary,is_active,
  created_at,updated_at,created_by,updated_by
)
select business_id,id,'phone',phone_normalized,phone,sms_consent_status,
  coalesce(sms_opted_out_at,sms_consent_recorded_at),'customer_profile',
  true,true,created_at,updated_at,created_by,updated_by
from public.customers where phone_normalized is not null
on conflict(business_id,customer_id,channel_type,normalized_value) do nothing;

insert into public.customer_contact_channels(
  business_id,customer_id,channel_type,normalized_value,display_value,
  consent_status,consent_recorded_at,consent_source,is_primary,is_active,
  created_at,updated_at,created_by,updated_by
)
select business_id,id,'phone',public.normalize_phone_e164(secondary_phone),secondary_phone,'unknown',
  null,'customer_profile',false,true,created_at,updated_at,created_by,updated_by
from public.customers where public.normalize_phone_e164(secondary_phone) is not null
on conflict(business_id,customer_id,channel_type,normalized_value) do nothing;

-- Audit snapshots are intentionally private to owners/admins because they can
-- contain historical customer PII. The PR 2 transaction is its only writer.
create table if not exists public.customer_merge_audits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  primary_customer_id uuid not null,
  duplicate_customer_id uuid not null,
  performed_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint text not null check(length(request_fingerprint) between 32 and 256),
  preview_fingerprint text not null check(length(preview_fingerprint) between 32 and 256),
  request_payload jsonb not null default '{}'::jsonb check(jsonb_typeof(request_payload)='object'),
  primary_snapshot jsonb not null check(jsonb_typeof(primary_snapshot)='object'),
  duplicate_snapshot jsonb not null check(jsonb_typeof(duplicate_snapshot)='object'),
  field_resolutions jsonb not null default '{}'::jsonb check(jsonb_typeof(field_resolutions)='object'),
  affected_record_counts jsonb not null default '{}'::jsonb check(jsonb_typeof(affected_record_counts)='object'),
  status text not null default 'completed' check(status in ('completed','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(business_id,idempotency_key),
  unique(business_id,id),
  foreign key(business_id,primary_customer_id) references public.customers(business_id,id) on delete restrict,
  foreign key(business_id,duplicate_customer_id) references public.customers(business_id,id) on delete restrict,
  check(primary_customer_id <> duplicate_customer_id)
);
create index if not exists customer_merge_audits_primary_timeline_idx
  on public.customer_merge_audits(business_id,primary_customer_id,created_at desc);

alter table public.customer_contact_channels enable row level security;
alter table public.customer_merge_audits enable row level security;
create policy "owners and admins read customer contact channels" on public.customer_contact_channels
  for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));
create policy "owners and admins manage customer contact channels" on public.customer_contact_channels
  for all to authenticated using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "owners and admins read customer merge audits" on public.customer_merge_audits
  for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));

create or replace function public.prevent_customer_merge_audit_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Customer merge audit history is immutable' using errcode='55000';
end $$;
drop trigger if exists customer_merge_audits_immutable on public.customer_merge_audits;
create trigger customer_merge_audits_immutable
  before update or delete on public.customer_merge_audits
  for each row execute function public.prevent_customer_merge_audit_mutation();

-- Reject self-merges and cycles even if a future write path bypasses the UI.
create or replace function public.validate_customer_merge_target()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.merged_into_customer_id is null then return new; end if;
  if new.merged_into_customer_id = new.id then
    raise exception 'A customer cannot be merged into itself' using errcode='23514';
  end if;
  if exists (
    with recursive chain(id,depth) as (
      select new.merged_into_customer_id,1
      union all
      select c.merged_into_customer_id,chain.depth+1
      from public.customers c join chain on c.id=chain.id
      where c.business_id=new.business_id
        and c.merged_into_customer_id is not null
        and chain.depth < 64
    ) select 1 from chain where id=new.id
  ) then
    raise exception 'Customer merge would create a circular reference' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists customers_validate_merge_target on public.customers;
create trigger customers_validate_merge_target
  before insert or update of merged_into_customer_id on public.customers
  for each row execute function public.validate_customer_merge_target();

create or replace function public.bump_customer_merge_version()
returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.merge_version=old.merge_version+1;
  end if;
  return new;
end $$;
drop trigger if exists customers_bump_merge_version on public.customers;
create trigger customers_bump_merge_version
  before update on public.customers
  for each row execute function public.bump_customer_merge_version();

-- This is read-only and does not widen authorization. Callers must still
-- authorize their original customer/document before resolving its canonical ID.
create or replace function public.resolve_canonical_customer_id(p_business_id uuid,p_customer_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  with recursive chain(id,merged_into_customer_id,depth) as (
    select c.id,c.merged_into_customer_id,0 from public.customers c
    where c.business_id=p_business_id and c.id=p_customer_id
    union all
    select c.id,c.merged_into_customer_id,chain.depth+1
    from public.customers c join chain on c.id=chain.merged_into_customer_id
    where c.business_id=p_business_id and chain.depth < 64
  )
  select id from chain where merged_into_customer_id is null order by depth desc limit 1
$$;
revoke all on function public.resolve_canonical_customer_id(uuid,uuid) from public;
grant execute on function public.resolve_canonical_customer_id(uuid,uuid) to authenticated,service_role;

create or replace view public.customer_canonical_memberships
with(security_invoker=true) as
select c.business_id,c.id as customer_id,
  public.resolve_canonical_customer_id(c.business_id,c.id) as canonical_customer_id,
  c.merged_into_customer_id is not null as is_merged
from public.customers c;

-- Preserve the legacy RPC signature for deployed callers, but make it fail
-- closed until the audited preview/confirm engine exists. It cannot bypass the
-- owner/admin boundary, immutable audit, contact-channel, or stale-preview rules.
create or replace function public.merge_duplicate_customer_contact(p_source_customer_id uuid,p_target_customer_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Legacy duplicate-contact merge is retired; use Customer Merge preview and confirmation.'
    using errcode='55000';
end $$;
revoke all on function public.merge_duplicate_customer_contact(uuid,uuid) from public;
grant execute on function public.merge_duplicate_customer_contact(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
