begin;

create table public.promotions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 discount_id uuid not null unique references public.discounts(id) on delete cascade, name text not null, slug text not null,
 status text not null default 'draft' check(status in ('draft','active','paused','expired','sold_out')),
 headline text not null, subheadline text, cta_text text not null default 'Claim offer', hero_image text, terms text,
 max_eligible_items_per_booking integer not null default 1 check(max_eligible_items_per_booking > 0),
 landing_page_enabled boolean not null default true, auto_apply boolean not null default true, stackable boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id, lower(slug)), check(slug ~ '^[a-z0-9-]{2,80}$')
);
create table public.promotion_categories (
 promotion_id uuid not null references public.promotions(id) on delete cascade, category_id uuid not null references public.rental_inventory_categories(id) on delete cascade,
 primary key(promotion_id,category_id)
);
create table public.promotion_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 promotion_id uuid not null references public.promotions(id) on delete cascade, attribution_session_id uuid, event_name text not null check(event_name in ('landing_page_view','cta_click','product_selected','booking_started','checkout_started','completed_booking')),
 event_key text unique, metadata jsonb not null default '{}', occurred_at timestamptz not null default now()
);
create index promotion_events_report_idx on public.promotion_events(promotion_id,event_name,occurred_at desc);
alter table public.promotions enable row level security; alter table public.promotion_categories enable row level security; alter table public.promotion_events enable row level security;
create policy "members read promotions" on public.promotions for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage promotions" on public.promotions for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read promotion events" on public.promotion_events for select to authenticated using(public.is_business_member(business_id));
create trigger promotions_updated_at before update on public.promotions for each row execute function public.set_routing_updated_at();

-- Final consumption is serialized on the discount row. No visit, click, or failed payment creates a redemption.
create or replace function public.finalize_promotion_redemption(p_business_id uuid,p_discount_id uuid,p_customer_id uuid,p_booking_id uuid,p_amount integer)
returns void language plpgsql security definer set search_path=public as $$
declare rule public.discounts;
begin
 select * into rule from public.discounts where id=p_discount_id and business_id=p_business_id for update;
 if not found or not rule.is_active then raise exception 'promotion_unavailable'; end if;
 if rule.usage_limit is not null and (select count(*) from public.discount_redemptions where discount_id=rule.id and status='redeemed') >= rule.usage_limit then raise exception 'promotion_sold_out'; end if;
 if p_customer_id is not null and rule.per_customer_limit is not null and (select count(*) from public.discount_redemptions where discount_id=rule.id and customer_id=p_customer_id and status='redeemed') >= rule.per_customer_limit then raise exception 'promotion_customer_limit'; end if;
 insert into public.discount_redemptions(business_id,discount_id,customer_id,booking_id,amount_discounted_cents,status,redeemed_at) values(p_business_id,p_discount_id,p_customer_id,p_booking_id,p_amount,'redeemed',now()) on conflict(business_id,booking_id) do update set status='redeemed',redeemed_at=coalesce(discount_redemptions.redeemed_at,now());
end; $$;
revoke all on function public.finalize_promotion_redemption(uuid,uuid,uuid,uuid,integer) from public;
grant execute on function public.finalize_promotion_redemption(uuid,uuid,uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
