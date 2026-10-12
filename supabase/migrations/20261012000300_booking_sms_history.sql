begin;

alter table public.customer_messages
 add column if not exists history_body_pending boolean not null default false,
 add column if not exists history_retry_at timestamptz not null default now();
create index if not exists customer_messages_history_pending_idx
 on public.customer_messages(business_id,history_retry_at) where history_body_pending;

-- Import only provider-accepted customer SMS. Never regenerate historical text
-- from today's template, and never replace canonical rows or their read state.
create or replace function public.record_booking_sms_history(
 p_business_id uuid,p_customer_id uuid,p_phone text,p_body text,
 p_sid text,p_source text,p_sent_at timestamptz
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_phone text; v_customer uuid; v_body text;
begin
 if p_business_id is null or p_sid is null or p_sid !~ '^(SM|MM)[a-zA-Z0-9]{32}$' then return; end if;
 v_phone=public.normalize_phone_e164(p_phone);
 if v_phone is null then return; end if;
 select id into v_customer from public.customers where id=p_customer_id and business_id=p_business_id;
 v_body=nullif(btrim(p_body),'');
 if length(v_body)>1600 then v_body=null; end if;
 insert into public.customer_messages(business_id,customer_id,counterparty_phone_e164,direction,
  provider,provider_message_id,body,status,source_type,sent_at,created_at,history_body_pending)
 values(p_business_id,v_customer,v_phone,'outbound','twilio',p_sid,
  coalesce(v_body,'['||replace(p_source,'_',' ')||' sent. Original message text was not saved; retrieval pending.]'),
  'sent','legacy_'||p_source,coalesce(p_sent_at,now()),coalesce(p_sent_at,now()),v_body is null)
 on conflict(provider,provider_message_id) do nothing;
end $$;
revoke all on function public.record_booking_sms_history(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;

create or replace function public.capture_booking_sms_history()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business uuid; v_customer uuid; v_phone text;
begin
 if new.status<>'sent' then return new; end if;
 if tg_table_name='job_communication_events' then
  -- An allowlist prevents staff notifications or future internal templates
  -- from appearing in a customer's conversation.
  if new.channel<>'sms' or new.template_key not in
   ('booking_confirmation','booking_pending','booking_cancelled','reminder','review_request',
    'payment_receipt','payment_request','technician_en_route','job_rescheduled',
    'job_cancelled','job_completed','scheduled_arrival_window','route_en_route','route_proximity_eta') then return new; end if;
  select j.business_id,c.id,coalesce(nullif(new.recipient_phone,''),u.to_phone_e164,c.phone_normalized,c.phone)
   into v_business,v_customer,v_phone
   from public.jobs j left join public.customers c on c.id=j.customer_id and c.business_id=j.business_id
   left join public.twilio_message_usage u on u.business_id=j.business_id and u.twilio_message_sid=new.provider_message_id
   where j.id=new.job_id;
  perform public.record_booking_sms_history(v_business,v_customer,v_phone,new.message_body,new.provider_message_id,new.template_key,coalesce(new.sent_at,new.created_at));
 else
  select b.business_id,c.id into v_business,v_customer from public.bookings b
   left join public.customers c on c.id=b.customer_id and c.business_id=b.business_id where b.id=new.booking_id;
  perform public.record_booking_sms_history(v_business,v_customer,new.to_phone,new.body,new.twilio_message_sid,
   'booking_'||coalesce(new.template_key,'sms'),coalesce(new.sent_at,new.created_at));
 end if;
 return new;
end $$;
revoke all on function public.capture_booking_sms_history() from public,anon,authenticated;
create or replace trigger job_sms_customer_history after insert or update of status,provider_message_id on public.job_communication_events
 for each row execute function public.capture_booking_sms_history();
create or replace trigger booking_sms_customer_history after insert or update of status,twilio_message_sid on public.sms_messages
 for each row execute function public.capture_booking_sms_history();

select public.record_booking_sms_history(j.business_id,c.id,
 coalesce(nullif(e.recipient_phone,''),u.to_phone_e164,c.phone_normalized,c.phone),e.message_body,
 e.provider_message_id,e.template_key,coalesce(e.sent_at,e.created_at))
from public.job_communication_events e join public.jobs j on j.id=e.job_id
left join public.customers c on c.id=j.customer_id and c.business_id=j.business_id
left join public.twilio_message_usage u on u.business_id=j.business_id and u.twilio_message_sid=e.provider_message_id
where e.channel='sms' and e.status='sent' and e.template_key in
 ('booking_confirmation','booking_pending','booking_cancelled','reminder','review_request',
  'payment_receipt','payment_request','technician_en_route','job_rescheduled',
  'job_cancelled','job_completed','scheduled_arrival_window','route_en_route','route_proximity_eta');

select public.record_booking_sms_history(b.business_id,c.id,s.to_phone,s.body,s.twilio_message_sid,
 'booking_'||coalesce(s.template_key,'sms'),coalesce(s.sent_at,s.created_at))
from public.sms_messages s join public.bookings b on b.id=s.booking_id
left join public.customers c on c.id=b.customer_id and c.business_id=b.business_id
where s.status='sent';
notify pgrst,'reload schema';
commit;
