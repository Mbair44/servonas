begin;

-- Forward-only repair for installations whose prior function body differed in
-- whitespace from the initial migration. This changes only the $0 validation
-- and payment-request state; inventory, add-ons, and idempotency remain in the
-- installed canonical function.
do $$
declare definition text; original text;
begin
 select pg_get_functiondef('public.create_assisted_rental_booking(uuid,uuid,jsonb,jsonb)'::regprocedure) into definition;
 original:=definition;
 definition:=regexp_replace(definition,
  'if v_subtotal<0 or v_discount is null or v_discount<0 or v_discount>v_subtotal or v_delivery is null or v_delivery<0 or v_tax is null or v_tax<0 or v_deposit is null or v_deposit<=0 or v_deposit>v_total then raise exception ''Check the confirmed amounts\.''; ?end if;',
  'if v_subtotal<0 or v_total<0 or v_discount is null or v_discount<0 or v_discount>v_subtotal or v_delivery is null or v_delivery<0 or v_tax is null or v_tax<0 or v_deposit is null or v_deposit>v_total or (v_total=0 and v_deposit<>0) or (v_total>0 and v_deposit<=0) then raise exception ''Check the confirmed amounts.''; end if;');
 definition:=regexp_replace(definition,
  'payment_request_expires_at=now\(\)\+interval ''24 hours'',assisted_request_key=p_request_key',
  'status=case when v_total=0 then ''confirmed'' else status end,payment_request_expires_at=case when v_total=0 then null else now()+interval ''24 hours'' end,assisted_request_key=p_request_key');
 if definition=original then raise exception 'Zero-total assisted booking repair could not find the installed validation.'; end if;
 execute definition;
end $$;

notify pgrst,'reload schema';
commit;
