begin;

alter table public.platform_fee_ledger drop constraint if exists platform_fee_ledger_event_type_check;
alter table public.platform_fee_ledger add constraint platform_fee_ledger_event_type_check check(event_type in(
 'reserved','released','captured','refund_reversal','dispute_opened','dispute_won','dispute_lost',
 'dispute_fee_reversal','dispute_fee_recovery','reconciliation_exception'
));

create or replace function public.record_platform_fee_dispute_adjustment(
 p_reservation_id uuid,p_provider_dispute_id text,p_provider_charge_id text,p_provider_application_fee_id text,
 p_connected_account_id text,p_adjustment_type text,p_adjustment_cents integer,p_application_fee_refunded_cents integer,p_event_key text
) returns boolean language plpgsql security definer set search_path=public as $$
declare r public.platform_fee_reservations; v_customer_refunds integer; v_dispute_net integer; v_expected integer; v_amount integer;
begin
 if p_adjustment_type not in('dispute_fee_reversal','dispute_fee_recovery') or p_adjustment_cents<=0 or p_application_fee_refunded_cents<0 then
  raise exception 'Invalid dispute adjustment';
 end if;
 select * into r from public.platform_fee_reservations where id=p_reservation_id for update;
 if not found or r.state<>'captured' then raise exception 'captured reservation required'; end if;
 if r.provider_charge_id is distinct from p_provider_charge_id or r.provider_application_fee_id is distinct from p_provider_application_fee_id then
  raise exception 'Conflicting dispute provider identity';
 end if;
 select coalesce(sum(-amount_cents),0) into v_customer_refunds from public.platform_fee_ledger where reservation_id=r.id and event_type='refund_reversal';
 select coalesce(sum(case when event_type='dispute_fee_reversal' then -amount_cents else amount_cents end),0) into v_dispute_net from public.platform_fee_ledger where reservation_id=r.id and event_type in('dispute_fee_reversal','dispute_fee_recovery');
 v_amount:=case when p_adjustment_type='dispute_fee_reversal' then -p_adjustment_cents else p_adjustment_cents end;
 v_expected:=v_customer_refunds+v_dispute_net-v_amount;
 if v_expected<>p_application_fee_refunded_cents or v_expected<0 or v_expected>r.reserved_fee_cents then
  raise exception 'Dispute adjustment does not reconcile to verified application-fee amount';
 end if;
 insert into public.platform_fee_ledger(business_id,cycle_id,reservation_id,event_key,event_type,amount_cents,provider_payment_id,provider_event_id,metadata)
 values(r.business_id,r.cycle_id,r.id,p_event_key,p_adjustment_type,v_amount,r.payment_reference,p_provider_dispute_id,
  jsonb_build_object('provider_dispute_id',p_provider_dispute_id,'provider_charge_id',p_provider_charge_id,'provider_application_fee_id',p_provider_application_fee_id,'connected_account_id',p_connected_account_id,'application_fee_refunded_cents',p_application_fee_refunded_cents))
 on conflict(event_key) do nothing;
 return true;
end $$;
revoke all on function public.record_platform_fee_dispute_adjustment(uuid,text,text,text,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.record_platform_fee_dispute_adjustment(uuid,text,text,text,text,text,integer,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
