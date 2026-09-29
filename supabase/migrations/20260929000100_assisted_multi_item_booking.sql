begin;
alter table public.bookings add column if not exists assisted_request_key uuid;
alter table public.bookings add column if not exists assisted_pricing_snapshot jsonb;
alter table public.booking_items add column if not exists item_name_snapshot text;
alter table public.booking_items add column if not exists assisted_pricing_snapshot jsonb;
create unique index if not exists bookings_assisted_request_key on public.bookings(business_id,assisted_request_key) where assisted_request_key is not null;

-- Staff authorization is checked by the server action. Only the service role can execute.
-- The canonical reservation function retains all inventory locks and conflict rules.
create or replace function public.create_assisted_rental_booking(p_business_id uuid,p_request_key uuid,p_items jsonb,p_details jsonb)
returns table(booking_id uuid,booking_number bigint)
language plpgsql security definer set search_path=public as $$
declare
 v_created record;v_entry jsonb;v_item record;v_sum bigint:=0;v_subtotal integer;
 v_discount integer:=(p_details->>'discount')::integer;v_delivery integer:=(p_details->>'delivery')::integer;
 v_tax integer:=(p_details->>'tax')::integer;v_total integer;v_deposit integer:=(p_details->>'deposit')::integer;
 v_description text:='Rental items:';v_unit integer;v_quantity integer;
begin
 if p_business_id is null or p_request_key is null then raise exception 'Booking request is missing.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||p_request_key::text,0));
 select b.id as booking_id,b.booking_number,b.assisted_pricing_snapshot into v_created from public.bookings b where b.business_id=p_business_id and b.assisted_request_key=p_request_key;
 if found then
  if v_created.assisted_pricing_snapshot->>'requestHash' is distinct from md5(p_items::text||p_details::text) then raise exception 'This request already created a booking. Open Jobs to edit that booking instead of resubmitting changed details.';end if;
  return query select v_created.booking_id,v_created.booking_number;return;
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Choose at least one rental.';end if;
 if (select count(distinct entry->>'inventoryItemId') from jsonb_array_elements(p_items) entry)<>jsonb_array_length(p_items) then raise exception 'Use one line per rental with the desired quantity.';end if;
 for v_entry in select value from jsonb_array_elements(p_items) loop
  select * into v_item from public.inventory_items where id=(v_entry->>'inventoryItemId')::uuid and business_id=p_business_id and active;
  if not found then raise exception 'A selected rental is no longer available.';end if;
  v_unit:=(v_entry->>'unitPriceCents')::integer;v_quantity:=(v_entry->>'quantity')::integer;
  if v_unit is null or v_unit<0 or v_quantity is null or v_quantity<1 then raise exception 'Invalid rental price or quantity.';end if;
  v_sum:=v_sum+v_unit::bigint*v_quantity;
  v_description:=v_description||E'\n'||v_item.name||' × '||v_quantity;
 end loop;
 v_subtotal:=coalesce((p_details->>'subtotalOverride')::integer,v_sum::integer);
 v_total:=v_subtotal-v_discount+v_delivery+v_tax;
 if v_subtotal<0 or v_discount is null or v_discount<0 or v_discount>v_subtotal or v_delivery is null or v_delivery<0 or v_tax is null or v_tax<0 or v_deposit is null or v_deposit<=0 or v_deposit>v_total then raise exception 'Check the confirmed amounts.';end if;
 select * into v_created from public.create_public_booking_quantities_timed(
  p_items,(p_details->>'rentalDate')::date,(p_details->>'rentalDate')::date,
  p_details->>'firstName',p_details->>'lastName',p_details->>'email',p_details->>'phone',
  '09:00'::time,'17:00'::time,p_details->>'address',p_details->>'city',p_details->>'zip',
  'Admin-assisted booking'||E'\n'||v_description);
 -- Only the newly created rows are updated; canonical date/duration snapshots remain intact.
 update public.booking_items bi set
  item_name_snapshot=i.name,
  assisted_pricing_snapshot=jsonb_build_object('source','staff','canonicalUnitPriceCents',bi.unit_price_cents,'unitPriceCents',(entry->>'unitPriceCents')::integer,'lineSubtotalCents',(entry->>'unitPriceCents')::integer*bi.quantity),
  unit_price_cents=(entry->>'unitPriceCents')::integer
 from jsonb_array_elements(p_items) entry,public.inventory_items i
 where bi.booking_id=v_created.booking_id and bi.inventory_item_id=(entry->>'inventoryItemId')::uuid and i.id=bi.inventory_item_id;
 update public.bookings set subtotal_cents=v_subtotal,discount_cents=v_discount,delivery_fee_cents=v_delivery,tax_cents=v_tax,
  total_cents=v_total,deposit_cents=v_deposit,balance_due_cents=v_total-v_deposit,
  payment_request_expires_at=now()+interval '24 hours',assisted_request_key=p_request_key,
  assisted_pricing_snapshot=jsonb_build_object('requestHash',md5(p_items::text||p_details::text),'source','staff','itemSubtotalCents',v_sum,'subtotalOverrideCents',(p_details->>'subtotalOverride')::integer,'subtotalCents',v_subtotal,'discountCents',v_discount,'deliveryCents',v_delivery,'taxCents',v_tax,'totalCents',v_total,'depositCents',v_deposit)
 where id=v_created.booking_id and business_id=p_business_id;
 if coalesce((p_details->>'smsConsent')::boolean,false) then
  perform public.record_staff_booking_sms_consent(v_created.booking_id,true,p_details->>'smsDisclosure',p_details->>'smsDisclosureVersion');
 end if;
 return query select v_created.booking_id,v_created.booking_number;
end;$$;
revoke all on function public.create_assisted_rental_booking(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_assisted_rental_booking(uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
