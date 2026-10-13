begin;

create table public.event_giveaways (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 discount_id uuid references public.discounts(id) on delete set null,
 title text not null check(length(title) between 1 and 160),
 slug text not null check(slug ~ '^[a-z0-9-]{2,80}$'),
 description text not null default '', prize text not null check(length(prize) between 1 and 500),
 entry_starts_at timestamptz, entry_ends_at timestamptz,
 eligibility_rules text, official_rules_url text, privacy_url text,
 status text not null default 'draft' check(status in ('draft','published','closed','archived')),
 attribution_campaign text, created_by uuid references auth.users(id) on delete set null,
 published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,lower(slug)),
 check(entry_ends_at is null or entry_starts_at is null or entry_ends_at > entry_starts_at),
 check(status <> 'published' or (entry_starts_at is not null and entry_ends_at is not null and nullif(btrim(eligibility_rules),'') is not null))
);

create table public.event_giveaway_entries (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 giveaway_id uuid not null references public.event_giveaways(id) on delete cascade,
 customer_id uuid references public.customers(id) on delete set null,
 first_name text not null check(length(first_name) between 1 and 100), email text not null,
 normalized_email text generated always as (lower(btrim(email))) stored,
 phone text, email_marketing_consent boolean not null default false, email_marketing_consented_at timestamptz,
 email_marketing_consent_text text, sms_marketing_consent boolean not null default false, sms_marketing_consented_at timestamptz,
 sms_marketing_consent_text text, attribution_session_id uuid, utm_source text, utm_medium text, utm_campaign text,
 submitted_ip_hash text, user_agent text, created_at timestamptz not null default now(),
 unique(giveaway_id,normalized_email),
 check((not email_marketing_consent) or (email_marketing_consented_at is not null and nullif(btrim(email_marketing_consent_text),'') is not null)),
 check((not sms_marketing_consent) or (sms_marketing_consented_at is not null and nullif(btrim(sms_marketing_consent_text),'') is not null))
);
create index event_giveaway_entries_business_created_idx on public.event_giveaway_entries(business_id,giveaway_id,created_at desc);

create table public.event_giveaway_events (
 id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id) on delete cascade,
 giveaway_id uuid not null references public.event_giveaways(id) on delete cascade, entry_id uuid references public.event_giveaway_entries(id) on delete set null,
 booking_id uuid references public.bookings(id) on delete set null, event_name text not null check(event_name in ('page_view','entry_submitted','booking_attributed')),
 event_key text unique, attribution_session_id uuid, booked_revenue_cents integer, occurred_at timestamptz not null default now()
);
create table public.event_giveaway_winner_draws (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 giveaway_id uuid not null references public.event_giveaways(id) on delete cascade, winner_entry_id uuid not null references public.event_giveaway_entries(id) on delete restrict,
 eligible_entry_count integer not null check(eligible_entry_count > 0), randomness_commitment text not null, drawn_by uuid references auth.users(id) on delete set null, drawn_at timestamptz not null default now(), notes text
);

create or replace function public.enforce_event_giveaway_tenant() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.event_giveaways g where g.id=new.giveaway_id and g.business_id=new.business_id) then raise exception 'giveaway_tenant_mismatch'; end if;
 if new.customer_id is not null and not exists(select 1 from public.customers c where c.id=new.customer_id and c.business_id=new.business_id) then raise exception 'customer_tenant_mismatch'; end if;
 return new;
end; $$;
create trigger event_giveaway_entry_tenant_guard before insert or update on public.event_giveaway_entries for each row execute function public.enforce_event_giveaway_tenant();
create or replace function public.enforce_event_giveaway_record_tenant() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.event_giveaways g where g.id=new.giveaway_id and g.business_id=new.business_id) then raise exception 'giveaway_tenant_mismatch'; end if;
 return new;
end; $$;
create trigger event_giveaway_event_tenant_guard before insert or update on public.event_giveaway_events for each row execute function public.enforce_event_giveaway_record_tenant();
create trigger event_giveaway_draw_tenant_guard before insert or update on public.event_giveaway_winner_draws for each row execute function public.enforce_event_giveaway_record_tenant();
create trigger event_giveaways_updated_at before update on public.event_giveaways for each row execute function public.set_routing_updated_at();

alter table public.event_giveaways enable row level security; alter table public.event_giveaway_entries enable row level security; alter table public.event_giveaway_events enable row level security; alter table public.event_giveaway_winner_draws enable row level security;
create policy "members read event giveaways" on public.event_giveaways for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage event giveaways" on public.event_giveaways for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read giveaway entries" on public.event_giveaway_entries for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage giveaway entries" on public.event_giveaway_entries for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read giveaway events" on public.event_giveaway_events for select to authenticated using(public.is_business_member(business_id));
create policy "members read giveaway draws" on public.event_giveaway_winner_draws for select to authenticated using(public.is_business_member(business_id));
revoke insert,update,delete on public.event_giveaway_events,public.event_giveaway_winner_draws from anon,authenticated;
notify pgrst,'reload schema';
commit;
