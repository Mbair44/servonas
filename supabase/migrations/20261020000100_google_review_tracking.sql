begin;

-- Locations are deliberately separate from the legacy one-location connection so a
-- tenant can connect and sync more than one Google Business Profile location.
create table if not exists public.business_google_locations (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 google_account_id text not null,
 google_location_id text not null,
 location_title text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id, google_location_id)
);
create index if not exists business_google_locations_active_idx on public.business_google_locations(business_id) where is_active;
insert into public.business_google_locations(business_id,google_account_id,google_location_id,location_title)
select business_id,google_account_id,google_location_id,location_title
from public.business_google_profile_connections
where google_account_id is not null and google_location_id is not null
on conflict(business_id,google_location_id) do nothing;

create table if not exists public.google_reviews (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 google_location_id uuid not null references public.business_google_locations(id) on delete cascade,
 google_review_id text not null,
 reviewer_display_name text,
 reviewer_profile_photo_url text,
 star_rating smallint check(star_rating between 1 and 5), review_text text,
 review_created_at timestamptz, review_updated_at timestamptz,
 reply_text text, reply_updated_at timestamptz,
 google_review_url text, is_available boolean not null default true,
 last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (google_location_id, google_review_id)
);
create index if not exists google_reviews_business_idx on public.google_reviews(business_id,google_location_id,review_created_at desc);

create table if not exists public.google_review_customer_matches (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 review_id uuid not null references public.google_reviews(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 status text not null check(status in ('suggested','confirmed','rejected')),
 confidence numeric(5,4), match_reason jsonb not null default '{}'::jsonb,
 decided_by uuid references auth.users(id) on delete set null, decided_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(review_id,customer_id)
);
create unique index if not exists google_review_one_confirmed_customer_idx on public.google_review_customer_matches(review_id) where status='confirmed';
create index if not exists google_review_customer_matches_customer_idx on public.google_review_customer_matches(business_id,customer_id,status);

create table if not exists public.customer_review_overrides (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 google_location_id uuid references public.business_google_locations(id) on delete cascade,
 status text not null check(status in ('reviewed','review_requests_opted_out')),
 active boolean not null default true, reason text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), reversed_at timestamptz, reversed_by uuid references auth.users(id) on delete set null
);
create index if not exists customer_review_overrides_lookup_idx on public.customer_review_overrides(business_id,customer_id,google_location_id) where active;

create table if not exists public.google_review_sync_runs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 google_location_id uuid references public.business_google_locations(id) on delete cascade,
 status text not null check(status in ('started','succeeded','failed','permissions_error')),
 error_code text,error_message text,started_at timestamptz not null default now(),completed_at timestamptz,records_seen integer not null default 0
);

alter table public.job_communication_events add column if not exists suppression_reason text;
alter table public.job_communication_events add column if not exists processing_started_at timestamptz;
alter table public.bookings add column if not exists review_sms_suppressed_at timestamptz;
alter table public.job_communication_events drop constraint if exists job_communication_events_status_check;
alter table public.job_communication_events add constraint job_communication_events_status_check check(status in ('stubbed','queued','sent','failed','suppressed'));

-- This is the final, transactionally serialized eligibility decision. The SMS
-- worker calls it immediately before Twilio; suggested matches never qualify.
create or replace function public.claim_google_review_request_eligibility(p_event_id uuid,p_business_id uuid,p_customer_id uuid,p_google_location_id uuid)
returns table(eligible boolean,reason text) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_reason text;
begin
 perform 1 from public.customers where id=p_customer_id and business_id=p_business_id for update;
 if not found then return query select false,'customer_not_found'; return; end if;
 if exists(select 1 from public.google_review_customer_matches m join public.google_reviews r on r.id=m.review_id where m.business_id=p_business_id and m.customer_id=p_customer_id and m.status='confirmed' and r.is_available and r.google_location_id=p_google_location_id) then v_reason='customer_confirmed_google_review';
 elsif exists(select 1 from public.customer_review_overrides o where o.business_id=p_business_id and o.customer_id=p_customer_id and o.active and o.status='reviewed' and (o.google_location_id is null or o.google_location_id=p_google_location_id)) then v_reason='customer_manually_marked_reviewed';
 elsif exists(select 1 from public.customer_review_overrides o where o.business_id=p_business_id and o.customer_id=p_customer_id and o.active and o.status='review_requests_opted_out') then v_reason='review_requests_opted_out';
 end if;
 if v_reason is not null then
  update public.job_communication_events set status='suppressed',suppression_reason=v_reason,error_message='Skipped: '||replace(v_reason,'_',' ') where id=p_event_id and status='queued';
  return query select false,v_reason; return;
 end if;
 return query select true,null::text;
end $$;
revoke all on function public.claim_google_review_request_eligibility(uuid,uuid,uuid,uuid) from public,anon,authenticated;

-- A short lease prevents concurrent cron invocations from both sending while
-- allowing an interrupted worker or ordinary transient failure to be retried.
create or replace function public.claim_review_request_event(p_job_id uuid,p_phone text,p_event_key text)
returns table(event_id uuid,claimed boolean) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.job_communication_events%rowtype;
begin
 insert into public.job_communication_events(job_id,channel,template_key,event_key,recipient_phone,status,processing_started_at)
 values(p_job_id,'sms','review_request',p_event_key,p_phone,'queued',now())
 on conflict do nothing;
 select * into v_event from public.job_communication_events where job_id=p_job_id and channel='sms' and template_key='review_request' and event_key=p_event_key for update;
 if not found then return; end if;
 if v_event.status in ('sent','suppressed') then return query select v_event.id,false; return; end if;
 if v_event.status='queued' and v_event.processing_started_at is not null and v_event.processing_started_at>now()-interval '5 minutes' then return query select v_event.id,false; return; end if;
 update public.job_communication_events set status='queued',processing_started_at=now(),error_message=null,suppression_reason=null where id=v_event.id;
 return query select v_event.id,true;
end $$;
revoke all on function public.claim_review_request_event(uuid,text,text) from public,anon,authenticated;

alter table public.business_google_locations enable row level security;
alter table public.google_reviews enable row level security;
alter table public.google_review_customer_matches enable row level security;
alter table public.customer_review_overrides enable row level security;
alter table public.google_review_sync_runs enable row level security;
drop policy if exists "members view google review locations" on public.business_google_locations;
create policy "members view google review locations" on public.business_google_locations for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "members view google reviews" on public.google_reviews;
create policy "members view google reviews" on public.google_reviews for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "members view google review matches" on public.google_review_customer_matches;
create policy "members view google review matches" on public.google_review_customer_matches for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "members view review overrides" on public.customer_review_overrides;
create policy "members view review overrides" on public.customer_review_overrides for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "members view review sync runs" on public.google_review_sync_runs;
create policy "members view review sync runs" on public.google_review_sync_runs for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "managers manage review matches" on public.google_review_customer_matches;
create policy "managers manage review matches" on public.google_review_customer_matches for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
drop policy if exists "managers manage review overrides" on public.customer_review_overrides;
create policy "managers manage review overrides" on public.customer_review_overrides for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));

-- Foreign keys alone do not prove that linked rows belong to the same tenant.
create or replace function public.validate_google_review_tenant_links() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='google_review_customer_matches' and (not exists(select 1 from public.google_reviews r where r.id=new.review_id and r.business_id=new.business_id) or not exists(select 1 from public.customers c where c.id=new.customer_id and c.business_id=new.business_id)) then raise exception 'Review match tenant mismatch' using errcode='23503'; end if;
 if tg_table_name='customer_review_overrides' and (not exists(select 1 from public.customers c where c.id=new.customer_id and c.business_id=new.business_id) or (new.google_location_id is not null and not exists(select 1 from public.business_google_locations l where l.id=new.google_location_id and l.business_id=new.business_id))) then raise exception 'Review override tenant mismatch' using errcode='23503'; end if;
 return new;
end $$;
drop trigger if exists google_review_match_tenant_guard on public.google_review_customer_matches;
create trigger google_review_match_tenant_guard before insert or update on public.google_review_customer_matches for each row execute function public.validate_google_review_tenant_links();
drop trigger if exists customer_review_override_tenant_guard on public.customer_review_overrides;
create trigger customer_review_override_tenant_guard before insert or update on public.customer_review_overrides for each row execute function public.validate_google_review_tenant_links();
notify pgrst,'reload schema';
commit;
