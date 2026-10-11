begin;

-- A completed child leg is not proof that a person answered: a carrier
-- voicemail can complete it too. Keep the explicit classification used by
-- the routing and missed-call recovery handlers.
alter table public.voice_calls
 add column if not exists human_answered boolean not null default false,
 add column if not exists missed_call_sms_claimed_at timestamptz;

alter table public.business_voice_settings
 alter column missed_call_sms_body set default 'Hi! Sorry we missed your call — this is {{business_name}}. How can we help? 🎉';

alter table public.voice_call_legs
 add column if not exists answer_type text,
 add column if not exists machine_detected_at timestamptz;
alter table public.voice_call_legs
 drop constraint if exists voice_call_legs_answer_type_check;
alter table public.voice_call_legs
 add constraint voice_call_legs_answer_type_check check(answer_type is null or answer_type in ('human','machine','fax','unknown'));

create index if not exists voice_call_legs_call_terminal_idx
 on public.voice_call_legs(call_id,status,answer_type);

notify pgrst,'reload schema';
commit;
