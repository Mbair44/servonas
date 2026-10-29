-- Send a review request on its intended one-day follow-up run. A newly-created
-- event owns its lease immediately; a concurrent worker sees that lease and
-- does not send a duplicate.
create or replace function public.claim_review_request_event(p_job_id uuid,p_phone text,p_event_key text)
returns table(event_id uuid,claimed boolean) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.job_communication_events%rowtype;
begin
 insert into public.job_communication_events(job_id,channel,template_key,event_key,recipient_phone,status,processing_started_at)
 values(p_job_id,'sms','review_request',p_event_key,p_phone,'queued',now())
 on conflict do nothing
 returning * into v_event;

 if found then
  return query select v_event.id,true;
  return;
 end if;

 select * into v_event from public.job_communication_events
 where job_id=p_job_id and channel='sms' and template_key='review_request' and event_key=p_event_key
 for update;
 if not found then return; end if;
 if v_event.status in ('sent','suppressed') then return query select v_event.id,false; return; end if;
 if v_event.status='queued' and v_event.processing_started_at is not null and v_event.processing_started_at>now()-interval '5 minutes' then return query select v_event.id,false; return; end if;
 update public.job_communication_events set status='queued',processing_started_at=now(),error_message=null,suppression_reason=null where id=v_event.id;
 return query select v_event.id,true;
end $$;

-- Preserve an auditable outcome for pending review texts that missed their
-- one-day window. They must never be delivered days late after this repair.
update public.job_communication_events event
set status='suppressed',
    suppression_reason='review_request_window_elapsed',
    error_message='Skipped: review request window elapsed.',
    processing_started_at=null
from public.bookings booking
join public.booking_items item on item.booking_id=booking.id
where event.job_id=booking.job_id
  and event.channel='sms'
  and event.template_key='review_request'
  and event.status in ('queued','failed')
  and item.rental_date < ((now() at time zone 'America/Phoenix')::date - 1);
