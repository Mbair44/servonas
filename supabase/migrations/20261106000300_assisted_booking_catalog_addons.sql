begin;

-- Keep staff-selected catalog add-ons in the same transaction as the assisted
-- rental reservation. The payment request is created only after these amounts
-- and customer-visible charge lines have been saved.
create or replace function public.create_assisted_rental_booking(p_business_id uuid,p_request_key uuid,p_items jsonb,p_details jsonb)
returns table(booking_id uuid,booking_number bigint)
language plpgsql security definer set search_path=public as $$
declare
 v_created record; v_entry jsonb; v_item record; v_addon record; v_addon_id uuid;
 v_sum bigint:=0; v_addon_subtotal bigint:=0; v_subtotal integer;
 v_discount integer:=(p_details->>'discount')::integer; v_delivery integer:=(p_details->>'delivery')::integer;
 v_tax integer:=(p_details->>'tax')::integer; v_total integer; v_deposit integer:=(p_details->>'deposit')::integer;
 v_description text:='Rental items:'; v_unit integer; v_quantity integer;
begin
 if p_business_id is null or p_request_key is null then raise exception 'Booking request is missing.'; end if;
 if coalesce(p_details->'staffAddons','[]'::jsonb) is null or jsonb_typeof(coalesce(p_details->'staffAddons','[]'::jsonb))<>'array' then raise exception 'Booking add-ons are invalid.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||p_request_key::text,0));
 select b.id as booking_id,b.booking_number,b.assisted_pricing_snapshot into v_created from public.bookings b where b.business_id=p_business_id and b.assisted_request_key=p_request_key;
 if found then
  if v_created.assisted_pricing_snapshot->>'requestHash' is distinct from md5(p_items::text||p_details::text) then raise exception 'This request already created a booking. Open Jobs to edit that booking instead of resubmitting changed details.'; end if;
  return query select v_created.booking_id,v_created.booking_number; return;
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Choose at least one rental.'; end if;
 if (select count(distinct entry->>'inventoryItemId') from jsonb_array_elements(p_items) entry)<>jsonb_array_length(p_items) then raise exception 'Use one line per rental with the desired quantity.'; end if;

 create temporary table requested_assisted_catalog_addons(catalog_id uuid primary key,quantity integer not null) on commit drop;
 begin
  insert into requested_assisted_catalog_addons(catalog_id,quantity)
  select (entry->>'catalogId')::uuid,(entry->>'quantity')::integer from jsonb_array_elements(coalesce(p_details->'staffAddons','[]'::jsonb)) entry;
 exception when others then raise exception 'Booking add-ons are invalid.' using errcode='22023'; end;
 if (select count(*) from requested_assisted_catalog_addons)<>jsonb_array_length(coalesce(p_details->'staffAddons','[]'::jsonb))
    or exists(select 1 from requested_assisted_catalog_addons where quantity<1 or quantity>10000) then raise exception 'Booking add-ons are invalid.' using errcode='22023'; end if;
 if exists(select 1 from requested_assisted_catalog_addons requested left join public.job_addon_catalog catalog on catalog.id=requested.catalog_id and catalog.business_id=p_business_id and catalog.is_active and catalog.visibility='admin_only' where catalog.id is null) then raise exception 'One or more selected add-ons are unavailable.' using errcode='22023'; end if;
 select coalesce(sum(requested.quantity*catalog.default_unit_price_cents),0) into v_addon_subtotal from requested_assisted_catalog_addons requested join public.job_addon_catalog catalog on catalog.id=requested.catalog_id;

 for v_entry in select value from jsonb_array_elements(p_items) loop
  select * into v_item from public.inventory_items where id=(v_entry->>'inventoryItemId')::uuid and business_id=p_business_id and active;
  if not found then raise exception 'A selected rental is no longer available.'; end if;
  v_unit:=(v_entry->>'unitPriceCents')::integer; v_quantity:=(v_entry->>'quantity')::integer;
  if v_unit is null or v_unit<0 or v_quantity is null or v_quantity<1 then raise exception 'Invalid rental price or quantity.'; end if;
  v_sum:=v_sum+v_unit::bigint*v_quantity;
  v_description:=v_description||E'\n'||v_item.name||' × '||v_quantity;
 end loop;
 v_subtotal:=coalesce((p_details->>'subtotalOverride')::integer,v_sum::integer)+v_addon_subtotal;
 v_total:=v_subtotal-v_discount+v_delivery+v_tax;
 if v_subtotal<0 or v_discount is null or v_discount<0 or v_discount>v_subtotal or v_delivery is null or v_delivery<0 or v_tax is null or v_tax<0 or v_deposit is null or v_deposit<=0 or v_deposit>v_total then raise exception 'Check the confirmed amounts.'; end if;
 select * into v_created from public.create_public_booking_quantities_timed(p_items,(p_details->>'rentalDate')::date,(p_details->>'rentalDate')::date,p_details->>'firstName',p_details->>'lastName',p_details->>'email',p_details->>'phone','09:00'::time,'17:00'::time,p_details->>'address',p_details->>'city',p_details->>'zip','Admin-assisted booking'||E'\n'||v_description);
 update public.booking_items bi set item_name_snapshot=i.name,assisted_pricing_snapshot=jsonb_build_object('source','staff','canonicalUnitPriceCents',bi.unit_price_cents,'unitPriceCents',(entry->>'unitPriceCents')::integer,'lineSubtotalCents',(entry->>'unitPriceCents')::integer*bi.quantity),unit_price_cents=(entry->>'unitPriceCents')::integer from jsonb_array_elements(p_items) entry,public.inventory_items i where bi.booking_id=v_created.booking_id and bi.inventory_item_id=(entry->>'inventoryItemId')::uuid and i.id=bi.inventory_item_id;
 update public.bookings set subtotal_cents=v_subtotal,discount_cents=v_discount,delivery_fee_cents=v_delivery,tax_cents=v_tax,total_cents=v_total,deposit_cents=v_deposit,balance_due_cents=v_total-v_deposit,payment_request_expires_at=now()+interval '24 hours',assisted_request_key=p_request_key,assisted_pricing_snapshot=jsonb_build_object('requestHash',md5(p_items::text||p_details::text),'source','staff','itemSubtotalCents',v_sum,'staffAddonSubtotalCents',v_addon_subtotal,'staffAddons',coalesce(p_details->'staffAddons','[]'::jsonb),'subtotalOverrideCents',(p_details->>'subtotalOverride')::integer,'subtotalCents',v_subtotal,'discountCents',v_discount,'deliveryCents',v_delivery,'taxCents',v_tax,'totalCents',v_total,'depositCents',v_deposit) where id=v_created.booking_id and business_id=p_business_id;
 for v_addon in select catalog.*,requested.quantity from requested_assisted_catalog_addons requested join public.job_addon_catalog catalog on catalog.id=requested.catalog_id order by catalog.id loop
  insert into public.job_addons(business_id,booking_id,catalog_id,origin,name_snapshot,description_snapshot,quantity,unit_price_cents,is_taxable,tax_rate_basis_points,subtotal_cents,tax_cents,total_cents) values(p_business_id,v_created.booking_id,v_addon.id,'admin',v_addon.name,v_addon.description,v_addon.quantity,v_addon.default_unit_price_cents,v_addon.is_taxable,0,v_addon.quantity*v_addon.default_unit_price_cents,0,v_addon.quantity*v_addon.default_unit_price_cents) returning id into v_addon_id;
  insert into public.booking_charge_lines(business_id,booking_id,job_addon_id,line_type,name_snapshot,description_snapshot,quantity,unit_price_cents,subtotal_cents,tax_cents,total_cents) values(p_business_id,v_created.booking_id,v_addon_id,'job_addon',v_addon.name,v_addon.description,v_addon.quantity,v_addon.default_unit_price_cents,v_addon.quantity*v_addon.default_unit_price_cents,0,v_addon.quantity*v_addon.default_unit_price_cents);
  insert into public.job_addon_audit_events(business_id,booking_id,addon_id,action,before_values,after_values) values(p_business_id,v_created.booking_id,v_addon_id,'created','{}'::jsonb,jsonb_build_object('origin','admin','catalog_id',v_addon.id,'quantity',v_addon.quantity,'subtotal_cents',v_addon.quantity*v_addon.default_unit_price_cents,'tax_cents',0,'total_cents',v_addon.quantity*v_addon.default_unit_price_cents));
 end loop;
 if v_addon_subtotal>0 then insert into public.booking_change_audit(booking_id,business_id,change_source,change_type,new_values,resulting_total_cents,resulting_balance_due_cents) values(v_created.booking_id,p_business_id,'staff','assisted_booking_addons',jsonb_build_object('addons',coalesce(p_details->'staffAddons','[]'::jsonb)),v_total,v_total-v_deposit); end if;
 if coalesce((p_details->>'smsConsent')::boolean,false) then perform public.record_staff_booking_sms_consent(v_created.booking_id,true,p_details->>'smsDisclosure',p_details->>'smsDisclosureVersion'); end if;
 return query select v_created.booking_id,v_created.booking_number;
end;$$;

revoke all on function public.create_assisted_rental_booking(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_assisted_rental_booking(uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
