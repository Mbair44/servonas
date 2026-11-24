begin;

create table if not exists public.business_communication_downgrade_resolutions(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
 resource_kind text not null check(resource_kind in('phone_number','messaging_service','subaccount','scheduled_communications')),
 resource_id text not null,resolution_state text not null check(resolution_state in('identified','workflows_disabled','release_requested','released')),
 requested_by uuid references auth.users(id) on delete set null,confirmed_at timestamptz,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(business_id,resource_kind,resource_id)
);
alter table public.business_communication_downgrade_resolutions enable row level security;
create policy "platform admins manage communication downgrade resolutions" on public.business_communication_downgrade_resolutions for all to authenticated using(public.is_servonas_platform_admin()) with check(public.is_servonas_platform_admin());

create or replace function public.prevent_starter_with_chargeable_twilio_resources() returns trigger language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if new.plan_key='starter' and new.rollout_enabled then
  select count(*) into n from public.twilio_phone_numbers where business_id=new.business_id and status='active' and provisioning_status='active';
  if n>0 then raise exception 'Resolve active Twilio phone numbers before moving this tenant to Starter' using errcode='P0001'; end if;
 end if;
 return new;
end $$;
drop trigger if exists business_pricing_profile_starter_twilio_guard on public.business_pricing_profiles;
create trigger business_pricing_profile_starter_twilio_guard before insert or update of plan_key,rollout_enabled on public.business_pricing_profiles for each row execute function public.prevent_starter_with_chargeable_twilio_resources();

create or replace function public.admin_prepare_starter_communication_downgrade(p_business_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_numbers text[];v_account text;v_suppressed integer;
begin
 if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501';end if;
 if p_confirmation<>'DISABLE_COMMUNICATION_WORKFLOWS' then raise exception 'Explicit communication workflow confirmation is required' using errcode='22023';end if;
 select coalesce(array_agg(twilio_phone_number_sid),array[]::text[]) into v_numbers from public.twilio_phone_numbers where business_id=p_business_id and status='active' and provisioning_status='active';
 select twilio_subaccount_sid into v_account from public.business_twilio_accounts where business_id=p_business_id and provisioning_status='active';
 insert into public.business_communication_downgrade_resolutions(business_id,resource_kind,resource_id,resolution_state,requested_by,confirmed_at,notes) select p_business_id,'phone_number',sid,'workflows_disabled',auth.uid(),now(),'Provider release is intentionally not automatic.' from unnest(v_numbers) sid on conflict(business_id,resource_kind,resource_id) do update set resolution_state='workflows_disabled',requested_by=auth.uid(),confirmed_at=now(),updated_at=now();
 if v_account is not null then insert into public.business_communication_downgrade_resolutions(business_id,resource_kind,resource_id,resolution_state,requested_by,confirmed_at) values(p_business_id,'subaccount',v_account,'workflows_disabled',auth.uid(),now()) on conflict(business_id,resource_kind,resource_id) do update set resolution_state='workflows_disabled',updated_at=now();end if;
 update public.business_inbound_sms_settings set enabled=false where business_id=p_business_id;
 update public.business_voice_settings set enabled=false,missed_call_sms_enabled=false where business_id=p_business_id;
 update public.business_missed_call_settings set enabled=false where business_id=p_business_id;
 update public.job_communication_events e set status='suppressed',suppression_reason='starter_downgrade',error_message='Suppressed for Starter communication restriction.' from public.jobs j where e.job_id=j.id and j.business_id=p_business_id and e.channel='sms' and e.status in('queued','stubbed');get diagnostics v_suppressed=row_count;
 return jsonb_build_object('active_phone_numbers',v_numbers,'subaccount',v_account,'scheduled_messages_suppressed',v_suppressed,'provider_release_required',cardinality(v_numbers)>0);
end $$;
revoke all on function public.admin_prepare_starter_communication_downgrade(uuid,text) from public;
grant execute on function public.admin_prepare_starter_communication_downgrade(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
