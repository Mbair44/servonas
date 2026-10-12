begin;

-- Costs only: campaign/QR management remains a future feature. One expense per
-- tenant + UTM campaign, not a daily expense or a payment-ledger transaction.
create table public.business_offline_campaign_costs (
 business_id uuid not null references public.businesses(id) on delete cascade,
 utm_campaign text not null check (length(utm_campaign) between 1 and 200),
 cost_cents bigint not null check (cost_cents >= 0),
 currency text not null default 'USD' check (currency = 'USD'),
 description text,
 created_at timestamptz not null default now(),
 primary key (business_id, utm_campaign)
);
alter table public.business_offline_campaign_costs enable row level security;
create policy "members view offline campaign costs" on public.business_offline_campaign_costs
 for select to authenticated using (public.is_business_member(business_id));
grant select on public.business_offline_campaign_costs to authenticated;
grant all on public.business_offline_campaign_costs to service_role;
insert into public.business_offline_campaign_costs (business_id,utm_campaign,cost_cents,description)
 select id,'sandwich_sign',5000,'One-time 25 x 37 inch A-frame sign'
 from public.businesses where id='cb25acc0-3623-4c06-9041-89a88f4ad6ed'
 on conflict (business_id,utm_campaign) do nothing;

create index if not exists booking_attribution_sessions_offline_arrivals_idx
 on public.booking_attribution_sessions (business_id,session_started_at,utm_campaign)
 where utm_source='offline' and utm_medium='qr';

-- Cohort reporting: arrivals in the selected dates and their eventual outcomes.
-- Aggregate in Postgres so the API row limit cannot silently truncate counts.
create function public.offline_qr_campaign_report(p_business_id uuid,p_from timestamptz,p_to timestamptz)
returns table (campaign text,visits bigint,booking_page_visits bigint,checkout_starts bigint,
 completed_bookings bigint,converted_sessions bigint,booked_revenue_cents bigint,cost_cents bigint)
language sql stable security invoker set search_path=public as $$
 with cohort as (
  select s.* from public.booking_attribution_sessions s
  where s.business_id=p_business_id and (auth.role()='service_role' or public.is_business_member(p_business_id))
   and s.utm_source='offline' and s.utm_medium='qr' and s.utm_campaign is not null
   and s.session_started_at>=p_from and s.session_started_at<p_to
   and coalesce(s.automated_classification,'unknown') <> 'automated_likely'
 ), activity as (
  select s.id,s.utm_campaign,
   (s.entry_page_type='booking' or split_part(s.first_landing_path,'?',1) ~ '^(/booking/?|/book/[^/]+/?)$'
    or exists(select 1 from public.booking_funnel_events e where e.business_id=p_business_id and e.attribution_session_id=s.id
     and e.event_name in ('booking_started','reservation_details_viewed'))) as booking_visit,
   exists(select 1 from public.booking_funnel_events e where e.business_id=p_business_id and e.attribution_session_id=s.id
    and e.event_name in ('checkout_started','initiate_checkout')) as checkout_start
  from cohort s
 ), outcomes as (
  select s.id,count(distinct b.id) as bookings,coalesce(sum(b.total_cents),0)::bigint as revenue
  from cohort s join public.booking_attribution_snapshots a on a.business_id=p_business_id and a.attribution_session_id=s.id
  join public.bookings b on b.business_id=p_business_id and b.id=a.booking_id
  where b.status in ('confirmed','paid','scheduled','dispatched','en_route','arrived','in_progress','completed')
  group by s.id
 ), metrics as (
  select a.utm_campaign,count(*) as visits,count(*) filter(where a.booking_visit) as booking_visits,
   count(*) filter(where a.checkout_start) as checkout_starts,coalesce(sum(o.bookings),0)::bigint as bookings,
   count(*) filter(where o.bookings>0) as converted,coalesce(sum(o.revenue),0)::bigint as revenue
  from activity a left join outcomes o on o.id=a.id group by a.utm_campaign
 ), campaigns as (
  select utm_campaign from metrics union
  select c.utm_campaign from public.business_offline_campaign_costs c where c.business_id=p_business_id and (auth.role()='service_role' or public.is_business_member(p_business_id))
 )
 select c.utm_campaign,coalesce(m.visits,0),coalesce(m.booking_visits,0),coalesce(m.checkout_starts,0),
  coalesce(m.bookings,0),coalesce(m.converted,0),coalesce(m.revenue,0),cost.cost_cents
 from campaigns c left join metrics m on m.utm_campaign=c.utm_campaign
 left join public.business_offline_campaign_costs cost on cost.business_id=p_business_id and cost.utm_campaign=c.utm_campaign
 order by c.utm_campaign;
$$;
revoke all on function public.offline_qr_campaign_report(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.offline_qr_campaign_report(uuid,timestamptz,timestamptz) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
