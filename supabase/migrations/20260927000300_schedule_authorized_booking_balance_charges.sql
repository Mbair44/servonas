-- A deposit checkout can save the customer's card and authorization after the
-- original one-time scheduling migration has run. Keep the operational charge
-- date in sync without creating a charge or changing a payment balance.
begin;

create or replace function public.schedule_authorized_booking_balance_charge()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.balance_charge_scheduled_for is null
    and coalesce(new.balance_due_cents,0)>0
    and new.final_payment_authorized_at is not null
    and new.stripe_customer_id is not null
    and new.stripe_payment_method_id is not null
    and coalesce(new.rental_ends_at,new.rental_starts_at) is not null
  then
    new.balance_charge_scheduled_for:=coalesce(new.rental_ends_at,new.rental_starts_at);
  end if;
  return new;
end $$;

drop trigger if exists schedule_authorized_booking_balance_charge on public.bookings;
create trigger schedule_authorized_booking_balance_charge
before insert or update of balance_due_cents,final_payment_authorized_at,stripe_customer_id,stripe_payment_method_id,rental_starts_at,rental_ends_at
on public.bookings for each row execute function public.schedule_authorized_booking_balance_charge();

-- Backfill future rentals only. Past rentals remain untouched for staff review;
-- this migration never initiates a Stripe payment.
update public.bookings
set balance_charge_scheduled_for=coalesce(rental_ends_at,rental_starts_at)
where balance_charge_scheduled_for is null
  and coalesce(balance_due_cents,0)>0
  and final_payment_authorized_at is not null
  and stripe_customer_id is not null
  and stripe_payment_method_id is not null
  and status in ('confirmed','paid','completed')
  and coalesce(rental_ends_at,rental_starts_at)>now();

commit;
