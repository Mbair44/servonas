-- Smart Upsells Phase 4: keep the established amendment/reservation transaction,
-- but calculate tax for only the newly added rental lines. Historical booking tax is
-- retained; automatic-tax tenants are deliberately blocked until an address-aware
-- authoritative calculation can be committed in the same transaction.

create or replace function public.add_rental_items_to_booking_tax_correct(
  p_business_id uuid,
  p_booking_id uuid,
  p_items jsonb,
  p_discount_cents integer,
  p_discount_snapshot jsonb,
  p_idempotency_key text,
  p_change_source text default 'customer_manage_booking',
  p_amendment_id uuid default null,
  p_unit_price_overrides jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_before public.bookings%rowtype; v_after public.bookings%rowtype; v_result jsonb;
  v_added_ids uuid[]; v_taxable_subtotal integer:=0; v_incremental_discount integer:=0;
  v_added_tax integer:=0; v_rate integer:=0; v_tax_enabled boolean:=false;
  v_tax_method text:='manual'; v_tax_display text:='exclusive'; v_default_taxable boolean:=true; v_exempt boolean:=false;
  v_override record; v_bad_override boolean:=false;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_unit_price_overrides is null or jsonb_typeof(p_unit_price_overrides) <> 'object' then
    raise exception 'Unit price overrides must be an object.' using errcode='22023';
  end if;
  select * into v_before from public.bookings where id=p_booking_id and business_id=p_business_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  select coalesce(tax_enabled,false),coalesce(tax_calculation_method,'manual'),coalesce(tax_display_mode,'exclusive'),
         coalesce(default_tax_rate_basis_points,0),coalesce(default_invoice_item_taxable,true)
    into v_tax_enabled, v_tax_method, v_tax_display, v_rate, v_default_taxable
    from public.business_billing_settings where business_id=p_business_id;
  v_tax_enabled:=coalesce(v_tax_enabled,false); v_tax_method:=coalesce(v_tax_method,'manual');
  v_tax_display:=coalesce(v_tax_display,'exclusive'); v_rate:=coalesce(v_rate,0);
  v_default_taxable:=coalesce(v_default_taxable,true);
  if v_tax_enabled and v_tax_method='automatic' then
    raise exception 'Automatic tax amendments require address-aware tax reconciliation.' using errcode='P0001';
  end if;
  select coalesce(tax_exempt,false) into v_exempt from public.customers where id=v_before.customer_id;
  v_exempt:=coalesce(v_exempt,false);

  select public.add_rental_items_to_booking(p_business_id,p_booking_id,p_items,p_discount_cents,p_discount_snapshot,p_idempotency_key,p_change_source,p_amendment_id)
    into v_result;
  if coalesce((v_result->>'idempotent')::boolean,false) then return v_result; end if;

  select array_agg((row->>'booking_item_id')::uuid) into v_added_ids
    from jsonb_array_elements(coalesce(v_result->'items','[]'::jsonb)) row;
  if coalesce(array_length(v_added_ids,1),0)=0 then raise exception 'Rental amendment did not return added items.'; end if;
  -- Overrides are service-only and are limited to the lines created by this amendment.
  for v_override in select key,value from jsonb_each(p_unit_price_overrides) loop
    if v_override.value::text !~ '^[0-9]+$' or not exists(
      select 1 from public.booking_items bi where bi.id=any(v_added_ids) and bi.inventory_item_id=v_override.key::uuid
    ) then v_bad_override:=true; exit; end if;
    update public.booking_items set unit_price_cents=(v_override.value#>>'{}')::integer
      where id=any(v_added_ids) and inventory_item_id=v_override.key::uuid;
  end loop;
  if v_bad_override then raise exception 'Invalid immutable price override.' using errcode='22023'; end if;

  select * into v_after from public.bookings where id=p_booking_id for update;
  select coalesce(sum((bi.unit_price_cents+bi.option_adjustment_cents+bi.duration_adjustment_cents)*bi.quantity+bi.operator_charge_cents),0)::integer
    into v_after.subtotal_cents from public.booking_items bi where bi.booking_id=p_booking_id;
  v_incremental_discount:=greatest(0,coalesce(v_after.discount_cents,0)-coalesce(v_before.discount_cents,0));
  if v_tax_enabled and not v_exempt then
    select coalesce(sum((bi.unit_price_cents+bi.option_adjustment_cents+bi.duration_adjustment_cents)*bi.quantity+bi.operator_charge_cents),0)::integer
      into v_taxable_subtotal from public.booking_items bi join public.inventory_items i on i.id=bi.inventory_item_id
      where bi.id=any(v_added_ids) and coalesce(i.is_taxable,v_default_taxable);
    v_taxable_subtotal:=greatest(0,v_taxable_subtotal-least(v_taxable_subtotal,v_incremental_discount));
    v_added_tax:=case when v_tax_display='inclusive' then round(v_taxable_subtotal*v_rate/(10000+v_rate)) else round(v_taxable_subtotal*v_rate/10000.0) end;
  end if;
  update public.bookings set subtotal_cents=v_after.subtotal_cents,
    tax_cents=coalesce(v_before.tax_cents,0)+v_added_tax,
    total_cents=greatest(0,v_after.subtotal_cents-coalesce(v_after.discount_cents,0))+coalesce(v_after.delivery_fee_cents,0)+coalesce(v_before.tax_cents,0)+v_added_tax,
    balance_due_cents=greatest(0,greatest(0,v_after.subtotal_cents-coalesce(v_after.discount_cents,0))+coalesce(v_after.delivery_fee_cents,0)+coalesce(v_before.tax_cents,0)+v_added_tax-coalesce(v_after.amount_paid_cents,0)),updated_at=now()
    where id=p_booking_id returning * into v_after;
  update public.jobs set subtotal=(v_after.subtotal_cents+coalesce(v_after.delivery_fee_cents,0))/100.0,
    tax_amount=v_after.tax_cents/100.0,discount_amount=coalesce(v_after.discount_cents,0)/100.0,updated_at=now()
    where id=v_after.job_id and business_id=p_business_id;
  insert into public.booking_change_audit(booking_id,business_id,change_source,change_type,old_values,new_values,resulting_total_cents,resulting_balance_due_cents)
    values(p_booking_id,p_business_id,'system','rental_item_tax_recalculated',
      jsonb_build_object('tax_cents',coalesce(v_before.tax_cents,0),'subtotal_cents',coalesce(v_before.subtotal_cents,0)),
      jsonb_build_object('amendment_id',p_amendment_id,'added_tax_cents',v_added_tax,'taxable_added_subtotal_cents',v_taxable_subtotal,'automatic_tax_blocked',false),v_after.total_cents,v_after.balance_due_cents);
  select jsonb_build_object('booking',to_jsonb(b),'items',coalesce(jsonb_agg(to_jsonb(bi) order by bi.created_at),'[]'::jsonb),'idempotent',false)
    into v_result from public.bookings b left join public.booking_items bi on bi.booking_id=b.id where b.id=p_booking_id group by b.id;
  return v_result;
end $$;

revoke all on function public.add_rental_items_to_booking_tax_correct(uuid,uuid,jsonb,integer,jsonb,text,text,uuid,jsonb) from public;
grant execute on function public.add_rental_items_to_booking_tax_correct(uuid,uuid,jsonb,integer,jsonb,text,text,uuid,jsonb) to service_role;
