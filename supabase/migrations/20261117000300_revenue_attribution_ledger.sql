begin;

-- Append-only source of truth for prospective revenue attribution. Reconciliation
-- is deliberately separate from booking and payment writes: a reporting failure
-- can never make a checkout, webhook, or booking update fail.
create table if not exists public.revenue_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 event_type text not null check(event_type in ('original_booking','smart_upsell','adjustment','refund','reversal')),
 amount_cents bigint not null,
 occurred_at timestamptz not null,
 booking_created_at timestamptz not null,
 payment_status text,
 source_kind text not null,
 source_reference text not null,
 attribution_status text not null default 'attributed' check(attribution_status in ('attributed','unattributed')),
 related_event_id uuid references public.revenue_events(id) on delete restrict,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 recorded_at timestamptz not null default now(),
 unique(business_id,source_kind,source_reference)
);
create index if not exists revenue_events_business_occurred_idx on public.revenue_events(business_id,occurred_at desc);
create index if not exists revenue_events_booking_idx on public.revenue_events(business_id,booking_id,occurred_at);

create table if not exists public.revenue_event_attribution_issues (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 issue_type text not null check(issue_type in ('original_amount_ambiguous','smart_upsell_amount_ambiguous','refund_unattributed')),
 source_reference text not null,
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
 detected_at timestamptz not null default now(),
 unique(business_id,issue_type,source_reference)
);

alter table public.revenue_events enable row level security;
alter table public.revenue_event_attribution_issues enable row level security;
create policy "members view revenue events" on public.revenue_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members view revenue attribution issues" on public.revenue_event_attribution_issues for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
revoke all on public.revenue_events from public,authenticated;
revoke all on public.revenue_event_attribution_issues from public,authenticated;
grant select on public.revenue_events,public.revenue_event_attribution_issues to authenticated;
grant all on public.revenue_events,public.revenue_event_attribution_issues to service_role;

create or replace function public.reconcile_revenue_events(p_business_id uuid default null,p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inserted integer:=0; v_issues integer:=0; v_limit integer:=least(greatest(coalesce(p_limit,1000),1),5000);
begin
 if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 with accepted_smart as (
   select a.id,a.business_id,a.booking_id,a.applied_at,
     case when (a.old_totals->>'total_cents')~'^[0-9]+$' and (a.new_totals->>'total_cents')~'^[0-9]+$'
       then greatest(0,(a.new_totals->>'total_cents')::bigint-(a.old_totals->>'total_cents')::bigint) end as amount_cents
   from public.booking_amendments a join public.smart_upsell_offers o on o.id::text=a.pricing_snapshot->>'smart_upsell_offer_id' and o.business_id=a.business_id
   where (p_business_id is null or a.business_id=p_business_id) and a.status='applied' and a.applied_at is not null and o.status='accepted'
 ), inserted as (
   insert into public.revenue_events(business_id,booking_id,event_type,amount_cents,occurred_at,booking_created_at,payment_status,source_kind,source_reference,metadata)
   select s.business_id,s.booking_id,'smart_upsell',s.amount_cents,s.applied_at,b.created_at,'finalized','booking_amendment','smart-upsell:'||s.id::text,jsonb_build_object('amendment_id',s.id)
   from accepted_smart s join public.bookings b on b.id=s.booking_id and b.business_id=s.business_id
   where s.amount_cents is not null and s.amount_cents>0
   on conflict(business_id,source_kind,source_reference) do nothing returning 1
 ) select count(*) into v_inserted from inserted;
 with accepted_smart as (
   select a.booking_id,a.business_id,
     case when (a.old_totals->>'total_cents')~'^[0-9]+$' and (a.new_totals->>'total_cents')~'^[0-9]+$'
       then greatest(0,(a.new_totals->>'total_cents')::bigint-(a.old_totals->>'total_cents')::bigint) end as amount_cents
   from public.booking_amendments a join public.smart_upsell_offers o on o.id::text=a.pricing_snapshot->>'smart_upsell_offer_id' and o.business_id=a.business_id
   where (p_business_id is null or a.business_id=p_business_id) and a.status='applied' and o.status='accepted'
 ), inserted as (
   insert into public.revenue_events(business_id,booking_id,event_type,amount_cents,occurred_at,booking_created_at,payment_status,source_kind,source_reference,metadata)
   select b.business_id,b.id,'original_booking',greatest(0,b.total_cents-coalesce(s.total_cents,0)),b.created_at,b.created_at,'booked','booking','booking:'||b.id::text,jsonb_build_object('reconciled',true)
   from public.bookings b left join (select business_id,booking_id,sum(amount_cents)::bigint total_cents from accepted_smart where amount_cents is not null group by business_id,booking_id) s on s.booking_id=b.id and s.business_id=b.business_id
   where (p_business_id is null or b.business_id=p_business_id) and b.status in ('confirmed','paid','completed')
     and not exists(select 1 from public.booking_amendments a where a.booking_id=b.id and a.business_id=b.business_id and a.status='applied' and not(a.pricing_snapshot?'smart_upsell_offer_id'))
     and not exists(select 1 from accepted_smart invalid where invalid.booking_id=b.id and invalid.business_id=b.business_id and invalid.amount_cents is null)
   order by b.created_at limit v_limit
   on conflict(business_id,source_kind,source_reference) do nothing returning 1
 ) select v_inserted+count(*) into v_inserted from inserted;
 with inserted as (
   insert into public.revenue_event_attribution_issues(business_id,booking_id,issue_type,source_reference,details)
   select b.business_id,b.id,'original_amount_ambiguous','booking:'||b.id::text,jsonb_build_object('reason','non_smart_applied_amendment')
   from public.bookings b where (p_business_id is null or b.business_id=p_business_id)
     and exists(select 1 from public.booking_amendments a where a.booking_id=b.id and a.business_id=b.business_id and a.status='applied' and not(a.pricing_snapshot?'smart_upsell_offer_id'))
   on conflict(business_id,issue_type,source_reference) do nothing returning 1
 ) select count(*) into v_issues from inserted;
 return jsonb_build_object('inserted',v_inserted,'issues',v_issues);
end;$$;

create or replace function public.sales_performance_booked_attribution(p_business_id uuid,p_from date,p_through date)
returns table(booking_date date,new_booked_cents bigint,smart_upsell_cents bigint,booking_count bigint,incomplete_booking_count bigint)
language plpgsql stable security invoker set search_path=public as $$
declare v_timezone text; v_today date;
begin
 if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) and not public.is_servonas_platform_admin() then raise exception 'Sales performance denied' using errcode='42501'; end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 v_today=(now() at time zone v_timezone)::date;
 if p_from is null or p_through is null or p_from>p_through or p_from<date '1900-01-01' or p_through>v_today then raise exception 'Invalid sales date range' using errcode='22023'; end if;
 return query
 with accepted_smart as (
   select a.id,a.business_id,a.booking_id,a.applied_at,
     case when (a.old_totals->>'total_cents')~'^[0-9]+$' and (a.new_totals->>'total_cents')~'^[0-9]+$' then greatest(0,(a.new_totals->>'total_cents')::bigint-(a.old_totals->>'total_cents')::bigint) end amount_cents
   from public.booking_amendments a join public.smart_upsell_offers o on o.id::text=a.pricing_snapshot->>'smart_upsell_offer_id' and o.business_id=a.business_id
   where a.business_id=p_business_id and a.status='applied' and a.applied_at is not null and o.status='accepted'
 ), rows as (
   select (b.created_at at time zone v_timezone)::date as booking_date,greatest(0,b.total_cents-coalesce(s.total_cents,0))::bigint new_cents,0::bigint smart_cents,1::bigint bookings,0::bigint incomplete
   from public.bookings b left join (select business_id,booking_id,sum(amount_cents)::bigint total_cents from accepted_smart where amount_cents is not null group by business_id,booking_id) s on s.business_id=b.business_id and s.booking_id=b.id
   where b.business_id=p_business_id and b.status in ('confirmed','paid','completed') and b.created_at>=(p_from::timestamp at time zone v_timezone) and b.created_at<((p_through+1)::timestamp at time zone v_timezone)
     and not exists(select 1 from public.booking_amendments a where a.booking_id=b.id and a.business_id=b.business_id and a.status='applied' and not(a.pricing_snapshot?'smart_upsell_offer_id'))
     and not exists(select 1 from accepted_smart invalid where invalid.booking_id=b.id and invalid.amount_cents is null)
   union all
   select (s.applied_at at time zone v_timezone)::date as booking_date,0::bigint,s.amount_cents,0::bigint,0::bigint from accepted_smart s where s.amount_cents is not null and s.applied_at>=(p_from::timestamp at time zone v_timezone) and s.applied_at<((p_through+1)::timestamp at time zone v_timezone)
   union all
   select (b.created_at at time zone v_timezone)::date as booking_date,0::bigint,0::bigint,0::bigint,1::bigint from public.bookings b where b.business_id=p_business_id and b.created_at>=(p_from::timestamp at time zone v_timezone) and b.created_at<((p_through+1)::timestamp at time zone v_timezone)
     and exists(select 1 from public.booking_amendments a where a.booking_id=b.id and a.business_id=b.business_id and a.status='applied' and not(a.pricing_snapshot?'smart_upsell_offer_id'))
 ) select rows.booking_date,sum(rows.new_cents)::bigint,sum(rows.smart_cents)::bigint,sum(rows.bookings)::bigint,sum(rows.incomplete)::bigint from rows group by rows.booking_date order by rows.booking_date;
end;$$;

revoke all on function public.reconcile_revenue_events(uuid,integer) from public;
grant execute on function public.reconcile_revenue_events(uuid,integer) to service_role;
revoke all on function public.sales_performance_booked_attribution(uuid,date,date) from public;
grant execute on function public.sales_performance_booked_attribution(uuid,date,date) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
