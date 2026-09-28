begin;
set local search_path=public,extensions;
create extension if not exists btree_gist;
-- Composite ownership prevents cross-tenant item references, even for service-role writes.
create unique index if not exists inventory_items_id_business_key on public.inventory_items(id,business_id);
create table public.rental_item_pricing_rules (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 rental_item_id uuid not null,
 rule_type text not null check(rule_type in ('day_of_week','date_range','specific_date')),
 name text check(name is null or char_length(btrim(name)) between 1 and 120),
 day_of_week smallint,
 start_date date,
 end_date date,
 fixed_price_cents integer not null check(fixed_price_cents>=0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(rental_item_id,business_id) references public.inventory_items(id,business_id) on delete cascade,
 constraint rental_date_rule_shape check (
  (rule_type='day_of_week' and day_of_week is not null and day_of_week between 0 and 6 and start_date is null and end_date is null) or
  (rule_type='date_range' and day_of_week is null and start_date is not null and end_date is not null and isfinite(start_date) and isfinite(end_date) and end_date>=start_date) or
  (rule_type='specific_date' and day_of_week is null and start_date is not null and isfinite(start_date) and end_date=start_date and end_date is not null)
 ),
 constraint rental_date_ranges_no_overlap exclude using gist
 (rental_item_id with =, daterange(start_date,end_date,'[]') with &&)
 where (active and rule_type='date_range')
);
create unique index rental_weekday_unique on public.rental_item_pricing_rules(rental_item_id,day_of_week) where active and rule_type='day_of_week';
create unique index rental_specific_date_unique on public.rental_item_pricing_rules(rental_item_id,start_date) where active and rule_type='specific_date';
create index rental_date_rules_lookup on public.rental_item_pricing_rules(business_id,rental_item_id,rule_type,start_date,end_date) where active;
alter table public.rental_item_pricing_rules enable row level security;
create policy "managers manage rental date prices" on public.rental_item_pricing_rules for all to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager']))
 with check(public.has_business_role(business_id,array['owner','admin','manager']));
grant select,insert,update,delete on public.rental_item_pricing_rules to authenticated,service_role;
revoke all on public.rental_item_pricing_rules from anon;
create function public.touch_rental_date_rule() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at:=now(); return new; end; $$;
create trigger rental_date_rule_updated before update on public.rental_item_pricing_rules for each row execute function public.touch_rental_date_rule();

-- The sole date-rule selector. p_rental_date is a business-local civil date, NOT a UTC instant.
-- Date inputs intentionally do not undergo a timezone conversion that could move Saturday to Friday.
create function public.resolve_rental_date_price(p_business_id uuid,p_rental_item_id uuid,p_rental_date date)
 returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_base integer; v_rule public.rental_item_pricing_rules%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Not authorized'; end if;
 if p_rental_date is null or not isfinite(p_rental_date) then raise exception 'Choose a valid rental date.'; end if;
 select daily_price_cents into v_base from public.inventory_items where id=p_rental_item_id and business_id=p_business_id and active;
 if not found then raise exception 'Rental item not found in this business.'; end if;
 select * into v_rule from public.rental_item_pricing_rules where business_id=p_business_id and rental_item_id=p_rental_item_id and active and
  ((rule_type='specific_date' and start_date=p_rental_date) or
   (rule_type='date_range' and p_rental_date between start_date and end_date) or
   (rule_type='day_of_week' and day_of_week=extract(dow from p_rental_date)))
 order by case rule_type when 'specific_date' then 3 when 'date_range' then 2 else 1 end desc,id limit 1;
 return jsonb_build_object('originalBasePriceCents',v_base,'dateAdjustedBasePriceCents',coalesce(v_rule.fixed_price_cents,v_base),
  'appliedDateRuleId',v_rule.id,'appliedDateRuleType',v_rule.rule_type,'appliedDateRuleName',v_rule.name,'rentalDate',p_rental_date,'version',1);
end; $$;
revoke all on function public.resolve_rental_date_price(uuid,uuid,date) from public,anon;
grant execute on function public.resolve_rental_date_price(uuid,uuid,date) to authenticated,service_role;

alter table public.booking_items add column date_pricing_snapshot jsonb;
comment on column public.booking_items.date_pricing_snapshot is 'Immutable booked date selection; deleted/edited rules never rewrite this value. Duration amounts remain in existing columns; promotion/final totals remain on bookings.';

-- Use the existing SQL multi-day arithmetic and reservation transaction. Only replace its base input.
-- Copying the current function preserves installed availability/fulfillment fixes.
do $migration$
declare definition text; original text;
begin
 select pg_get_functiondef('public.create_public_booking_quantities_timed(jsonb,date,date,text,text,text,text,time,time,text,text,text,text)'::regprocedure) into original;
 definition:=replace(original,'v_additional:=case','v_item.daily_price_cents:=(public.resolve_rental_date_price(v_business_id,v_item.id,p_rental_date)->>''dateAdjustedBasePriceCents'')::integer; v_additional:=case');
 definition:=replace(definition,'i.daily_price_cents','(public.resolve_rental_date_price(v_business_id,i.id,p_rental_date)->>''dateAdjustedBasePriceCents'')::integer');
 definition:=replace(definition,'return query select v_booking_id,v_booking_number;',
 'update public.booking_items bi set date_pricing_snapshot=public.resolve_rental_date_price(v_business_id,bi.inventory_item_id,p_rental_date) where bi.booking_id=v_booking_id; return query select v_booking_id,v_booking_number;');
 if definition=original or position('set date_pricing_snapshot=' in definition)=0 or position('v_item.daily_price_cents:=' in definition)=0 then raise exception 'Unexpected booking function definition; review date pricing integration.'; end if;
 execute definition;
end $migration$;

-- Preserve the existing resource locks, availability checks, and totals transaction for additions.
do $migration$
declare definition text; original text;
begin
 select pg_get_functiondef('public.add_rental_items_to_booking(uuid,uuid,jsonb,integer,jsonb,text,text,uuid)'::regprocedure) into original;
 definition:=replace(original,'v_old jsonb;', 'v_date_price jsonb; v_staged_line jsonb; v_staged public.booking_amendments%rowtype; v_old jsonb;');
 definition:=replace(definition,'select coalesce(timezone,', $patch$
 if p_amendment_id is not null then
  select * into v_staged from public.booking_amendments where id=p_amendment_id and booking_id=p_booking_id and business_id=p_business_id for update;
  if not found or v_staged.status not in ('pending_payment','payment_processing') or v_staged.expires_at<=now() then raise exception 'Staged amendment is unavailable.'; end if;
  if p_items is distinct from v_staged.requested_items then raise exception 'Staged rental selections changed.'; end if;
  if v_booking.subtotal_cents is distinct from (v_staged.old_totals->>'subtotal_cents')::integer or v_booking.total_cents is distinct from (v_staged.old_totals->>'total_cents')::integer then raise exception 'Booking changed after this amendment was quoted. Staff review is required.'; end if;
 end if;
 select coalesce(timezone,$patch$);
 definition:=replace(definition,'insert into public.booking_items(', $patch$
 v_date_price:=null;
 v_staged_line:=null;
 if p_amendment_id is not null then
  select value into v_staged_line from jsonb_array_elements(v_staged.pricing_snapshot->'added') where value->>'id'=v_item.id::text;
  if v_staged_line is null or (v_staged_line->>'quantity')::integer<>v_item.quantity then raise exception 'Staged item price is missing.'; end if;
  v_date_price:=v_staged_line->'datePricingSnapshot';
  -- Older staged quotes have no date metadata. Keep their stored unit price unchanged.
 else
  v_date_price:=public.resolve_rental_date_price(p_business_id,v_item.id,(v_start at time zone v_timezone)::date);
 end if;
 v_item.daily_price_cents:=coalesce((v_date_price->>'dateAdjustedBasePriceCents')::integer,v_item.daily_price_cents);
 insert into public.booking_items($patch$);
 definition:=replace(definition,'insert into public.booking_inventory_reservations(', $patch$
 update public.booking_items set date_pricing_snapshot=v_date_price where id=v_booking_item_id;
 if p_amendment_id is not null then
  update public.booking_items set unit_price_cents=(v_staged_line->>'unitPriceCents')::integer,
   base_unit_price_cents=coalesce((v_staged_line->>'baseUnitPriceCents')::integer,base_unit_price_cents),
   additional_day_unit_price_cents=coalesce((v_staged_line->>'additionalDayUnitPriceCents')::integer,additional_day_unit_price_cents),
   option_adjustment_cents=coalesce((v_staged_line->>'optionAdjustmentCents')::integer,0),
   option_selections=coalesce(v_staged_line->'optionSelections','[]'::jsonb)
  where id=v_booking_item_id;
 else
  if exists(select 1 from jsonb_array_elements(p_items) entry join public.booking_items bi on bi.id=v_booking_item_id
    where entry->>'inventoryItemId'=v_item.id::text and entry ? 'expectedRentalUnitPriceCents'
    and (entry->>'expectedRentalUnitPriceCents')::integer<>bi.unit_price_cents) then raise exception 'Rental pricing changed. Preview the booking update again.'; end if;
 end if;
 insert into public.booking_inventory_reservations($patch$);
 definition:=replace(definition,'v_discount:=greatest', $patch$
 if p_amendment_id is not null and v_subtotal is distinct from (v_staged.new_totals->>'subtotal_cents')::integer then raise exception 'Staged booking total changed; staff review is required.'; end if;
 v_discount:=greatest$patch$);
 if definition=original or position('v_date_price jsonb' in definition)=0 or position('set date_pricing_snapshot=v_date_price' in definition)=0 then raise exception 'Unexpected amendment function definition; review date pricing integration.'; end if;
 execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
