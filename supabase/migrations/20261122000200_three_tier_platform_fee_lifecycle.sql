begin;
create table if not exists public.platform_payment_allocations(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 reservation_id uuid references public.platform_fee_reservations(id) on delete restrict, payment_key text not null,
 charged_amount_cents integer not null check(charged_amount_cents>0), eligible_amount_cents integer not null check(eligible_amount_cents>=0 and eligible_amount_cents<=charged_amount_cents),
 eligible_charge_cents integer, eligible_tax_cents integer, tax_split_status text not null check(tax_split_status in('available','unavailable')),
 tips_cents integer not null default 0 check(tips_cents=0), refundable_security_deposit_cents integer not null default 0 check(refundable_security_deposit_cents=0), overpayment_cents integer not null default 0 check(overpayment_cents=0),
 currency text not null check(currency ~ '^[A-Z]{3}$'), allocation_version integer not null check(allocation_version=1), payment_flow text not null,
 allocation_reason text not null, provider_checkout_session_id text unique, provider_payment_intent_id text unique, provider_charge_id text unique,
 created_at timestamptz not null default now(), unique(business_id,payment_key)
 ,check((tax_split_status='available' and eligible_charge_cents>=0 and eligible_tax_cents>=0 and eligible_charge_cents+eligible_tax_cents=charged_amount_cents) or (tax_split_status='unavailable' and eligible_charge_cents is null and eligible_tax_cents is null))
 ,check(eligible_amount_cents=charged_amount_cents)
);
alter table public.platform_payment_allocations enable row level security;
create policy "owners read platform payment allocations" on public.platform_payment_allocations for select to authenticated using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());

create or replace function public.finalize_platform_fee_reservation(p_reservation_id uuid,p_provider_payment_id text,p_provider_charge_id text,p_event_key text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v public.platform_fee_reservations;
begin
 select * into v from public.platform_fee_reservations where id=p_reservation_id for update;
 if not found then raise exception 'Fee reservation not found'; end if;
 if v.state='captured' then return true; end if;
 if v.state<>'reserved' then raise exception 'Fee reservation cannot be captured'; end if;
 update public.platform_fee_reservations set state='captured',payment_reference=p_provider_payment_id,captured_at=now(),updated_at=now() where id=v.id;
 update public.platform_fee_cycles set reserved_cents=reserved_cents-v.reserved_fee_cents,captured_cents=captured_cents+v.reserved_fee_cents,updated_at=now() where id=v.cycle_id;
 insert into public.platform_fee_ledger(business_id,cycle_id,reservation_id,event_key,event_type,amount_cents,eligible_amount_cents,provider_payment_id,metadata)
 values(v.business_id,v.cycle_id,v.id,p_event_key,'captured',v.reserved_fee_cents,v.eligible_amount_cents,p_provider_payment_id,jsonb_build_object('provider_charge_id',p_provider_charge_id)) on conflict(event_key) do nothing;
 return true;
end $$;
create or replace function public.release_platform_fee_reservation(p_reservation_id uuid,p_event_key text,p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v public.platform_fee_reservations;
begin
 select * into v from public.platform_fee_reservations where id=p_reservation_id for update;
 if not found or v.state='released' then return true; end if;
 if v.state<>'reserved' then return false; end if;
 update public.platform_fee_reservations set state='released',released_at=now(),updated_at=now() where id=v.id;
 update public.platform_fee_cycles set reserved_cents=reserved_cents-v.reserved_fee_cents,updated_at=now() where id=v.cycle_id;
 insert into public.platform_fee_ledger(business_id,cycle_id,reservation_id,event_key,event_type,amount_cents,eligible_amount_cents,metadata)
 values(v.business_id,v.cycle_id,v.id,p_event_key,'released',-v.reserved_fee_cents,v.eligible_amount_cents,jsonb_build_object('reason',p_reason)) on conflict(event_key) do nothing;
 return true;
end $$;
revoke all on function public.finalize_platform_fee_reservation(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.release_platform_fee_reservation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_platform_fee_reservation(uuid,text,text,text) to service_role;
grant execute on function public.release_platform_fee_reservation(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
