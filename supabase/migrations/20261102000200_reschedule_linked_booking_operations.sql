-- Keep booking operations aligned with a rescheduled job regardless of which
-- approved scheduling surface made the change (office UI, assistant, or tools).
-- This migration never creates a charge or sends an SMS.
begin;

create or replace function public.reschedule_linked_booking_operations()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at then
    return new;
  end if;

  -- Rental timing is the source used by inventory availability and scheduled
  -- remaining-balance billing. Preserve an explicitly absent charge schedule;
  -- move an existing authorized schedule to the new service/rental end.
  update public.bookings b
  set rental_starts_at=new.starts_at,
      rental_ends_at=new.ends_at,
      balance_charge_scheduled_for=case
        when b.balance_charge_scheduled_for is not null
          and coalesce(b.balance_due_cents,0)>0
        then coalesce(new.ends_at,new.starts_at)
        else b.balance_charge_scheduled_for
      end,
      updated_at=now()
  where b.business_id=new.business_id
    and b.job_id=new.id
    and b.status not in ('cancelled','canceled','expired','refunded');

  -- A queued Smart Upsell SMS contains the event timing in its body. Do not
  -- deliver stale copy after a reschedule. Cancel only unsent offers/queue rows
  -- so the normal scheduler can create a fresh, date-correct offer later.
  update public.smart_upsell_sms_deliveries d
  set status='skipped', skipped_at=now(),
      last_error='Skipped because the linked booking was rescheduled.',
      updated_at=now()
  from public.smart_upsell_offers o
  where o.id=d.offer_id
    and o.business_id=new.business_id
    and o.booking_id in (select id from public.bookings where business_id=new.business_id and job_id=new.id)
    and o.status='pending'
    and d.status in ('queued','failed');

  update public.smart_upsell_offers o
  set status='canceled', canceled_at=now(), updated_at=now(),
      request_key=o.request_key||':rescheduled:'||extract(epoch from new.starts_at)::bigint::text,
      event_date=(new.starts_at at time zone 'UTC')::date,
      rental_starts_at=new.starts_at,
      rental_ends_at=new.ends_at,
      offer_metadata=o.offer_metadata||jsonb_build_object('canceled_reason','booking_rescheduled','rescheduled_at',now())
  where o.business_id=new.business_id
    and o.booking_id in (select id from public.bookings where business_id=new.business_id and job_id=new.id)
    and o.status='pending';

  return new;
end $$;

drop trigger if exists reschedule_linked_booking_operations on public.jobs;
create trigger reschedule_linked_booking_operations
after update of starts_at,ends_at on public.jobs
for each row execute function public.reschedule_linked_booking_operations();

commit;
