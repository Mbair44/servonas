begin;
alter table public.event_giveaways add column if not exists winner_draw_at timestamptz;
with business as (select id,name from public.businesses where id='cb25acc0-3623-4c06-9041-89a88f4ad6ed'::uuid), discount as (
 insert into public.discounts(business_id,name,code,discount_type,discount_value,applies_to,application_method,minimum_subtotal_cents,expires_at,is_active,first_time_customer_only)
 select id,'Main Event Gilbert giveaway entry reward','MAINEVENT25','fixed',2500,'order','code',17500,'2027-01-01T07:00:00Z'::timestamptz,false,false from business
 on conflict(business_id,normalized_code) do update set name=excluded.name,discount_value=excluded.discount_value,minimum_subtotal_cents=excluded.minimum_subtotal_cents,expires_at=excluded.expires_at,is_active=false
 returning id,business_id
)
insert into public.event_giveaways(business_id,discount_id,title,slug,description,prize,entry_starts_at,entry_ends_at,winner_draw_at,status,attribution_campaign)
select d.business_id,d.id,'Main Event Gilbert Trunk or Treat','main-event-gilbert-trunk-or-treat','Enter for a chance to win a rental credit.',' $200 credit toward an entire eligible rental order, including multiple rental items.','2026-10-31T00:00:00Z','2026-10-31T06:59:00Z','2026-10-31T17:00:00Z','draft','main_event_gilbert_trunk_or_treat' from discount d
on conflict(business_id,lower(slug)) do update set discount_id=excluded.discount_id,title=excluded.title,description=excluded.description,prize=excluded.prize,entry_starts_at=excluded.entry_starts_at,entry_ends_at=excluded.entry_ends_at,winner_draw_at=excluded.winner_draw_at,status='draft',attribution_campaign=excluded.attribution_campaign;
commit;
