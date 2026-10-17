-- Smart Upsells Phase 6: durable, tenant-scoped promotional SMS queue.
-- It is intentionally inert until the server-side scheduler gate is enabled.
create table if not exists public.smart_upsell_sms_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  offer_id uuid not null unique references public.smart_upsell_offers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  phone_e164 text not null check(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  body text not null check(char_length(body) between 1 and 1600),
  status text not null default 'queued' check(status in ('queued','sending','sent','delivered','failed','skipped','reconciliation_required')),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  twilio_message_sid text unique,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz, delivered_at timestamptz, failed_at timestamptz, skipped_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists smart_upsell_sms_dispatch_idx on public.smart_upsell_sms_deliveries(status,next_attempt_at) where status in ('queued','failed');

create or replace function public.enforce_smart_upsell_sms_delivery_tenant() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.smart_upsell_offers o where o.id=new.offer_id and o.business_id=new.business_id and o.customer_id=new.customer_id) then
   raise exception 'Smart Upsell SMS delivery tenant association is invalid.' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists smart_upsell_sms_delivery_tenant_guard on public.smart_upsell_sms_deliveries;
create trigger smart_upsell_sms_delivery_tenant_guard before insert or update of business_id,offer_id,customer_id
  on public.smart_upsell_sms_deliveries for each row execute function public.enforce_smart_upsell_sms_delivery_tenant();

alter table public.smart_upsell_sms_deliveries enable row level security;
create policy "staff view Smart Upsell SMS deliveries" on public.smart_upsell_sms_deliveries for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
revoke all on public.smart_upsell_sms_deliveries from public;
grant select on public.smart_upsell_sms_deliveries to authenticated;
