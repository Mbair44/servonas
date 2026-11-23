begin;

-- Application-fee identifiers are verified Stripe objects and are never inferred
-- from a Charge identifier.  Keep this association write-once for safe refunds.
alter table public.platform_fee_reservations
  add column if not exists provider_charge_id text,
  add column if not exists provider_application_fee_id text;
create unique index if not exists platform_fee_reservations_application_fee_id_key
  on public.platform_fee_reservations(provider_application_fee_id)
  where provider_application_fee_id is not null;

create or replace function public.finalize_platform_fee_reservation(
 p_reservation_id uuid,p_provider_payment_id text,p_provider_charge_id text,
 p_provider_application_fee_id text,p_provider_application_fee_cents integer,p_event_key text
) returns boolean language plpgsql security definer set search_path=public as $$
declare v public.platform_fee_reservations;
begin
 select * into v from public.platform_fee_reservations where id=p_reservation_id for update;
 if not found then raise exception 'Fee reservation not found'; end if;
 if p_provider_payment_id is null or p_provider_charge_id is null or p_provider_application_fee_id is null or p_provider_application_fee_cents is null then
   raise exception 'Verified Stripe payment, charge, and application fee identifiers are required';
 end if;
 if p_provider_application_fee_cents<>v.reserved_fee_cents then raise exception 'Application fee amount does not match reservation'; end if;
 if v.state='captured' then
   if v.payment_reference is distinct from p_provider_payment_id or v.provider_charge_id is distinct from p_provider_charge_id or v.provider_application_fee_id is distinct from p_provider_application_fee_id then
     raise exception 'Conflicting Stripe identity for captured reservation';
   end if;
   return true;
 end if;
 if v.state<>'reserved' then raise exception 'Fee reservation cannot be captured'; end if;
 update public.platform_fee_reservations set state='captured',payment_reference=p_provider_payment_id,provider_charge_id=p_provider_charge_id,provider_application_fee_id=p_provider_application_fee_id,captured_at=now(),updated_at=now() where id=v.id;
 update public.platform_fee_cycles set reserved_cents=reserved_cents-v.reserved_fee_cents,captured_cents=captured_cents+v.reserved_fee_cents,updated_at=now() where id=v.cycle_id;
 insert into public.platform_fee_ledger(business_id,cycle_id,reservation_id,event_key,event_type,amount_cents,eligible_amount_cents,provider_payment_id,metadata)
 values(v.business_id,v.cycle_id,v.id,p_event_key,'captured',v.reserved_fee_cents,v.eligible_amount_cents,p_provider_payment_id,jsonb_build_object('provider_charge_id',p_provider_charge_id,'provider_application_fee_id',p_provider_application_fee_id)) on conflict(event_key) do nothing;
 return true;
end $$;
revoke all on function public.finalize_platform_fee_reservation(uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.finalize_platform_fee_reservation(uuid,text,text,text,integer,text) to service_role;

-- A retry may see a pending row created before an ambiguous Stripe response.
-- Only this RPC can turn it into a confirmed immutable ledger adjustment.
create or replace function public.record_platform_fee_refund(p_reservation_id uuid,p_provider_refund_id text,p_provider_application_fee_refund_id text,p_customer_refund_cents integer,p_fee_refund_cents integer,p_event_key text)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.platform_fee_reservations; prior integer;
begin
 select * into r from public.platform_fee_reservations where id=p_reservation_id for update;
 if not found or r.state<>'captured' then raise exception 'captured reservation required'; end if;
 select coalesce(sum(-amount_cents),0) into prior from public.platform_fee_ledger where reservation_id=r.id and event_type='refund_reversal';
 if p_fee_refund_cents<0 or prior+p_fee_refund_cents>r.reserved_fee_cents then raise exception 'fee refund exceeds captured fee'; end if;
 insert into public.platform_fee_refunds(business_id,reservation_id,provider_refund_id,provider_application_fee_refund_id,customer_refund_cents,fee_refund_cents,status,completed_at)
 values(r.business_id,r.id,p_provider_refund_id,p_provider_application_fee_refund_id,p_customer_refund_cents,p_fee_refund_cents,'succeeded',now())
 on conflict(provider_refund_id) do update set provider_application_fee_refund_id=excluded.provider_application_fee_refund_id,status='succeeded',completed_at=excluded.completed_at
 where public.platform_fee_refunds.reservation_id=excluded.reservation_id and public.platform_fee_refunds.customer_refund_cents=excluded.customer_refund_cents and public.platform_fee_refunds.fee_refund_cents=excluded.fee_refund_cents;
 if not found then raise exception 'Conflicting provider refund identity'; end if;
 insert into public.platform_fee_ledger(business_id,cycle_id,reservation_id,event_key,event_type,amount_cents,provider_refund_id,metadata)
 values(r.business_id,r.cycle_id,r.id,p_event_key,'refund_reversal',-p_fee_refund_cents,p_provider_refund_id,jsonb_build_object('application_fee_refund_id',p_provider_application_fee_refund_id)) on conflict(event_key) do nothing;
 return true;
end $$;
revoke all on function public.record_platform_fee_refund(uuid,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.record_platform_fee_refund(uuid,text,text,integer,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
