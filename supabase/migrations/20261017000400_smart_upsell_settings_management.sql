-- Smart Upsells Phase 7: atomically save tenant settings and inventory rules.
-- Service-role only; the authenticated server action performs workspace authorization first.
create or replace function public.replace_smart_upsell_settings(
  p_business_id uuid,
  p_enabled boolean,
  p_send_before_event_hours integer,
  p_discount_basis_points integer,
  p_deposit_basis_points integer,
  p_offer_expiration_hours integer,
  p_max_offers_per_booking integer,
  p_minimum_discounted_price_cents integer,
  p_sms_send_window_start_hour integer,
  p_sms_send_window_end_hour integer,
  p_eligible_inventory_item_ids uuid[] default '{}'::uuid[],
  p_excluded_inventory_item_ids uuid[] default '{}'::uuid[]
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_eligible uuid[] := coalesce(p_eligible_inventory_item_ids,'{}'::uuid[]);
  v_excluded uuid[] := coalesce(p_excluded_inventory_item_ids,'{}'::uuid[]);
  v_expected integer;
  v_actual integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if exists (select 1 from unnest(v_eligible) as selected(id) join unnest(v_excluded) as excluded(id) on selected.id=excluded.id) then
    raise exception 'An inventory item cannot be both eligible and excluded.' using errcode='22023';
  end if;
  v_expected := cardinality(v_eligible) + cardinality(v_excluded);
  select count(*) into v_actual from public.inventory_items where business_id=p_business_id and active and id=any(v_eligible||v_excluded);
  if v_actual <> v_expected then raise exception 'One or more inventory selections are invalid.' using errcode='42501'; end if;
  insert into public.business_smart_upsell_settings(business_id,enabled,send_before_event_hours,discount_basis_points,deposit_basis_points,offer_expiration_hours,max_offers_per_booking,minimum_discounted_price_cents,sms_send_window_start_hour,sms_send_window_end_hour,updated_at)
  values(p_business_id,p_enabled,p_send_before_event_hours,p_discount_basis_points,p_deposit_basis_points,p_offer_expiration_hours,p_max_offers_per_booking,p_minimum_discounted_price_cents,p_sms_send_window_start_hour,p_sms_send_window_end_hour,now())
  on conflict (business_id) do update set enabled=excluded.enabled,send_before_event_hours=excluded.send_before_event_hours,discount_basis_points=excluded.discount_basis_points,deposit_basis_points=excluded.deposit_basis_points,offer_expiration_hours=excluded.offer_expiration_hours,max_offers_per_booking=excluded.max_offers_per_booking,minimum_discounted_price_cents=excluded.minimum_discounted_price_cents,sms_send_window_start_hour=excluded.sms_send_window_start_hour,sms_send_window_end_hour=excluded.sms_send_window_end_hour,updated_at=now();
  delete from public.smart_upsell_eligible_inventory_items where business_id=p_business_id;
  delete from public.smart_upsell_excluded_inventory_items where business_id=p_business_id;
  insert into public.smart_upsell_eligible_inventory_items(business_id,inventory_item_id) select p_business_id,selected.id from unnest(v_eligible) as selected(id);
  insert into public.smart_upsell_excluded_inventory_items(business_id,inventory_item_id) select p_business_id,selected.id from unnest(v_excluded) as selected(id);
end $$;
revoke all on function public.replace_smart_upsell_settings(uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid[],uuid[]) from public;
grant execute on function public.replace_smart_upsell_settings(uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid[],uuid[]) to service_role;
