begin;

-- Preserve the established assisted-booking implementation, including catalog
-- add-ons, while allowing a fully discounted $0 booking to be confirmed without
-- a payment request. The replacement is generated from the installed canonical
-- function so no booking or inventory behavior is forked.
do $$
declare definition text; original text;
begin
 select pg_get_functiondef('public.create_assisted_rental_booking(uuid,uuid,jsonb,jsonb)'::regprocedure) into definition;
 original:=definition;
 definition:=replace(definition,
  'if v_subtotal<0 or v_discount is null or v_discount<0 or v_discount>v_subtotal or v_delivery is null or v_delivery<0 or v_tax is null or v_tax<0 or v_deposit is null or v_deposit<=0 or v_deposit>v_total then raise exception ''Check the confirmed amounts.''; end if;',
  'if v_subtotal<0 or v_total<0 or v_discount is null or v_discount<0 or v_discount>v_subtotal or v_delivery is null or v_delivery<0 or v_tax is null or v_tax<0 or v_deposit is null or v_deposit>v_total or (v_total=0 and v_deposit<>0) or (v_total>0 and v_deposit<=0) then raise exception ''Check the confirmed amounts.''; end if;');
 definition:=replace(definition,
  'payment_request_expires_at=now()+interval ''24 hours'',assisted_request_key=p_request_key',
  'status=case when v_total=0 then ''confirmed'' else status end,payment_request_expires_at=case when v_total=0 then null else now()+interval ''24 hours'' end,assisted_request_key=p_request_key');
 if definition=original then raise exception 'Assisted booking function did not match the supported definition.'; end if;
 execute definition;
end $$;

notify pgrst,'reload schema';
commit;
