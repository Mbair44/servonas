begin;
create table if not exists public.business_ad_platform_spend_coverage(
 business_id uuid not null references public.businesses(id) on delete cascade,
 provider text not null check(provider in ('google_ads','meta')),
 report_date date not null, currency text not null, synced_at timestamptz not null default now(),
 primary key(business_id,provider,report_date)
);
alter table public.business_ad_platform_spend_coverage enable row level security;
create policy "members read ad spend coverage" on public.business_ad_platform_spend_coverage for select to authenticated using(public.is_business_member(business_id));

create or replace function public.sales_performance_blended_cac(p_business_id uuid,p_from date,p_through date)
returns table(report_date date,google_spend_cents bigint,meta_spend_cents bigint,new_customers bigint,spend_available boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_timezone text; v_today date;
begin
 if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) and not public.is_servonas_platform_admin() then raise exception 'CAC denied' using errcode='42501'; end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 v_today=(now() at time zone v_timezone)::date;
 if p_from is null or p_through is null or p_from>p_through or p_through>v_today then raise exception 'Invalid CAC date range' using errcode='22023'; end if;
 return query with dates as (select generate_series(p_from,p_through,interval '1 day')::date day),
 first_acquisitions as (select distinct on (b.customer_id) b.customer_id,(b.paid_at at time zone v_timezone)::date day from public.bookings b where b.business_id=p_business_id and b.customer_id is not null and b.status in ('confirmed','paid','completed') and coalesce(b.amount_paid_cents,0)>0 and b.paid_at is not null order by b.customer_id,b.paid_at,b.id),
 acquisitions as (select day,count(*)::bigint customers from first_acquisitions where day between p_from and p_through group by day),
 spend as (select performance.report_date,performance.provider,sum(round(performance.spend_amount*100))::bigint cents,bool_and(upper(performance.currency)='USD') usd from public.business_ad_platform_daily_performance performance where performance.business_id=p_business_id and performance.report_date between p_from and p_through and performance.provider in ('google_ads','meta') group by performance.report_date,performance.provider),
 coverage as (select spend_coverage.report_date,spend_coverage.provider,bool_and(upper(spend_coverage.currency)='USD') usd from public.business_ad_platform_spend_coverage spend_coverage where spend_coverage.business_id=p_business_id and spend_coverage.report_date between p_from and p_through group by spend_coverage.report_date,spend_coverage.provider)
 select d.day,coalesce(g.cents,0),coalesce(m.cents,0),coalesce(a.customers,0),coalesce(gc.usd,false) and coalesce(mc.usd,false) and coalesce(g.usd,true) and coalesce(m.usd,true)
 from dates d left join acquisitions a on a.day=d.day left join spend g on g.report_date=d.day and g.provider='google_ads' left join spend m on m.report_date=d.day and m.provider='meta' left join coverage gc on gc.report_date=d.day and gc.provider='google_ads' left join coverage mc on mc.report_date=d.day and mc.provider='meta' order by d.day;
end $$;
revoke all on function public.sales_performance_blended_cac(uuid,date,date) from public;
grant execute on function public.sales_performance_blended_cac(uuid,date,date) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
