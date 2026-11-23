begin;
create table public.platform_fee_refunds(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),reservation_id uuid not null references public.platform_fee_reservations(id),provider_refund_id text not null unique,provider_application_fee_refund_id text unique,customer_refund_cents integer not null check(customer_refund_cents>0),fee_refund_cents integer not null check(fee_refund_cents>=0),status text not null check(status in('pending','succeeded','failed','reconciliation_required')),created_at timestamptz not null default now(),completed_at timestamptz);
create table public.platform_fee_disputes(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),reservation_id uuid references public.platform_fee_reservations(id),provider_dispute_id text not null unique,status text not null,final_outcome text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.platform_fee_refunds enable row level security; alter table public.platform_fee_disputes enable row level security;
create policy "admins read platform fee refunds" on public.platform_fee_refunds for select to authenticated using(public.is_servonas_platform_admin());
create policy "admins read platform fee disputes" on public.platform_fee_disputes for select to authenticated using(public.is_servonas_platform_admin());
create or replace function public.record_platform_fee_refund(p_reservation_id uuid,p_provider_refund_id text,p_provider_application_fee_refund_id text,p_customer_refund_cents integer,p_fee_refund_cents integer,p_event_key text)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.platform_fee_reservations; prior integer;
begin
 select * into r from public.platform_fee_reservations where id=p_reservation_id for update;
 if not found or r.state<>'captured' then raise exception 'captured reservation required'; end if;
 select coalesce(sum(-amount_cents),0) into prior from public.platform_fee_ledger where reservation_id=r.id and event_type='refund_reversal';
 if p_fee_refund_cents<0 or prior+p_fee_refund_cents>r.reserved_fee_cents then raise exception 'fee refund exceeds captured fee'; end if;
 insert into public.platform_fee_refunds(business_id,reservation_id,provider_refund_id,provider_application_fee_refund_id,customer_refund_cents,fee_refund_cents,status,completed_at) values(r.business_id,r.id,p_provider_refund_id,p_provider_application_fee_refund_id,p_customer_refund_cents,p_fee_refund_cents,'succeeded',now()) on conflict(provider_refund_id) do nothing;
 insert into public.platform_fee_ledger(business_id,cycle_id,reservation_id,event_key,event_type,amount_cents,provider_refund_id,metadata) values(r.business_id,r.cycle_id,r.id,p_event_key,'refund_reversal',-p_fee_refund_cents,p_provider_refund_id,jsonb_build_object('application_fee_refund_id',p_provider_application_fee_refund_id)) on conflict(event_key) do nothing;
 return true;
end $$;
revoke all on function public.record_platform_fee_refund(uuid,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.record_platform_fee_refund(uuid,text,text,integer,integer,text) to service_role;
revoke insert,update,delete on public.platform_fee_refunds,public.platform_fee_disputes from anon,authenticated;
notify pgrst,'reload schema'; commit;
