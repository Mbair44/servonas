begin;

-- A visitor id is the existing consent-gated first-party anonymous id. It is
-- scoped by business here so one tenant can never inspect another's journeys.
alter table public.booking_attribution_sessions add column if not exists visitor_id uuid;
create index if not exists booking_attribution_sessions_business_visitor_seen_idx
 on public.booking_attribution_sessions(business_id,visitor_id,last_seen_at desc)
 where visitor_id is not null;

create table if not exists public.booking_attribution_visitors (
 business_id uuid not null references public.businesses(id) on delete cascade,
 visitor_id uuid not null,
 first_touch jsonb not null,
 last_touch jsonb not null,
 last_non_direct_touch jsonb,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (business_id,visitor_id)
);
create index if not exists booking_attribution_visitors_business_last_seen_idx
 on public.booking_attribution_visitors(business_id,last_seen_at desc);

alter table public.booking_attribution_snapshots
 add column if not exists visitor_id uuid,
 add column if not exists first_touch jsonb,
 add column if not exists last_touch jsonb,
 add column if not exists last_non_direct_touch jsonb,
 add column if not exists attribution_lookback_days integer,
 add column if not exists attribution_status text;
alter table public.booking_attribution_snapshots drop constraint if exists booking_attribution_snapshots_attribution_status_check;
alter table public.booking_attribution_snapshots add constraint booking_attribution_snapshots_attribution_status_check
 check (attribution_status is null or attribution_status in ('known','unknown','expired','consent_unavailable'));
create index if not exists booking_attribution_snapshots_business_first_touch_idx
 on public.booking_attribution_snapshots(business_id,((first_touch->>'source')));
create index if not exists booking_attribution_snapshots_business_last_touch_idx
 on public.booking_attribution_snapshots(business_id,((last_touch->>'source')));

create or replace function public.upsert_booking_attribution_visitor(
 p_business_id uuid,
 p_visitor_id uuid,
 p_touch jsonb
)
returns void language plpgsql security definer set search_path=public as $$
declare v_now timestamptz:=clock_timestamp(); v_seen timestamptz; v_source text;
begin
 if p_business_id is null or p_visitor_id is null or jsonb_typeof(p_touch) <> 'object' then raise exception 'Invalid attribution visitor input' using errcode='22023'; end if;
 v_seen:=coalesce(nullif(p_touch->>'occurred_at','')::timestamptz,v_now);
 v_source:=coalesce(nullif(p_touch->>'source',''),'unknown');
 insert into public.booking_attribution_visitors(business_id,visitor_id,first_touch,last_touch,last_non_direct_touch,first_seen_at,last_seen_at,created_at,updated_at)
 values(p_business_id,p_visitor_id,p_touch,p_touch,case when v_source not in ('direct','unknown') then p_touch else null end,v_seen,v_seen,v_now,v_now)
 on conflict(business_id,visitor_id) do update set
  first_touch=case when public.booking_attribution_visitors.first_seen_at<=v_seen then public.booking_attribution_visitors.first_touch else excluded.first_touch end,
  first_seen_at=least(public.booking_attribution_visitors.first_seen_at,v_seen),
  last_touch=case when public.booking_attribution_visitors.last_seen_at<=v_seen then excluded.last_touch else public.booking_attribution_visitors.last_touch end,
  last_non_direct_touch=case when v_source not in ('direct','unknown') and public.booking_attribution_visitors.last_seen_at<=v_seen then excluded.last_touch else public.booking_attribution_visitors.last_non_direct_touch end,
  last_seen_at=greatest(public.booking_attribution_visitors.last_seen_at,v_seen),updated_at=v_now;
end;$$;
revoke all on function public.upsert_booking_attribution_visitor(uuid,uuid,jsonb) from public;
grant execute on function public.upsert_booking_attribution_visitor(uuid,uuid,jsonb) to service_role;

alter table public.booking_attribution_visitors enable row level security;
drop policy if exists "members view booking attribution visitors" on public.booking_attribution_visitors;
create policy "members view booking attribution visitors" on public.booking_attribution_visitors for select to authenticated using (public.is_business_member(business_id));

notify pgrst,'reload schema';
commit;
