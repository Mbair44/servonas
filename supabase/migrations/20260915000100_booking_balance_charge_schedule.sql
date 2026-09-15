begin;

alter table public.bookings
  add column if not exists balance_charge_scheduled_for timestamptz;

update public.bookings
set balance_charge_scheduled_for=coalesce(rental_ends_at,rental_starts_at)
where balance_charge_scheduled_for is null
  and balance_due_cents>0
  and final_payment_authorized_at is not null;

create index if not exists bookings_balance_charge_due_idx
  on public.bookings(balance_charge_scheduled_for)
  where balance_due_cents>0 and final_payment_authorized_at is not null;

comment on column public.bookings.balance_charge_scheduled_for is
  'Earliest time an authorized remaining rental balance may be charged after its job is completed.';

create or replace function public.reschedule_booking_balance_charge(p_business_id uuid,p_booking_id uuid,p_scheduled_for timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if p_scheduled_for<date_trunc('day',now()) then raise exception 'Charge date cannot be in the past' using errcode='22023'; end if;
  update public.bookings set balance_charge_scheduled_for=p_scheduled_for
  where id=p_booking_id and business_id=p_business_id and balance_due_cents>0
    and final_payment_authorized_at is not null;
  if not found then raise exception 'Authorized booking balance not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.reschedule_booking_balance_charge(uuid,uuid,timestamptz) from public;
grant execute on function public.reschedule_booking_balance_charge(uuid,uuid,timestamptz) to authenticated,service_role;

commit;
