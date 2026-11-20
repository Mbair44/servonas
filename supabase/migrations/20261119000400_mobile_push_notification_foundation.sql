-- Additive foundation only: no webhook or delivery worker consumes these rows yet.
create table if not exists public.employee_mobile_notification_preferences (
 business_id uuid not null references public.businesses(id) on delete cascade,
 employee_id uuid not null,
 receive_incoming_text_notifications boolean not null default false,
 updated_at timestamptz not null default now(), updated_by uuid,
 primary key (business_id,employee_id),
 foreign key (business_id,employee_id) references public.employees(business_id,id) on delete cascade
);
create table if not exists public.mobile_device_registrations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, expo_push_token text not null check (char_length(expo_push_token) between 20 and 4096), is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deactivated_at timestamptz,
 unique (business_id,id), unique (business_id,user_id,expo_push_token)
);
create table if not exists public.inbound_message_push_outbox (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 message_id uuid not null,
 device_registration_id uuid not null,
 status text not null default 'pending' check(status in ('pending','processing','delivered','retryable_failure','terminal_failure','uncertain')),
 retry_count integer not null default 0 check(retry_count>=0), lease_owner text, lease_expires_at timestamptz, next_attempt_at timestamptz not null default now(), provider_outcome jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), delivered_at timestamptz,
 unique(business_id,message_id,device_registration_id),
 foreign key(business_id,message_id) references public.customer_messages(business_id,id) on delete cascade,
 foreign key(business_id,device_registration_id) references public.mobile_device_registrations(business_id,id) on delete cascade,
 check ((status <> 'processing') or (lease_owner is not null and lease_expires_at is not null))
);
create index if not exists inbound_message_push_outbox_claim_idx on public.inbound_message_push_outbox(status,next_attempt_at,lease_expires_at) where status in ('pending','retryable_failure','processing');
alter table public.employee_mobile_notification_preferences enable row level security;
alter table public.mobile_device_registrations enable row level security;
alter table public.inbound_message_push_outbox enable row level security;
revoke all on public.employee_mobile_notification_preferences,public.mobile_device_registrations,public.inbound_message_push_outbox from anon,authenticated;
grant select on public.employee_mobile_notification_preferences to authenticated;
create policy "owners admins read employee mobile notification preferences" on public.employee_mobile_notification_preferences for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));

create or replace function public.set_employee_mobile_notification_preference(
 p_business_id uuid,p_employee_id uuid,p_receive_incoming_text_notifications boolean
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin']) then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 if not exists(select 1 from public.employees e where e.business_id=p_business_id and e.id=p_employee_id and e.is_active) then
  raise exception 'Employee not found or inactive' using errcode='P0002';
 end if;
 if p_receive_incoming_text_notifications and not exists(select 1 from public.employees e where e.business_id=p_business_id and e.id=p_employee_id and e.auth_user_id is not null) then
  raise exception 'An authenticated employee account is required' using errcode='22023';
 end if;
 insert into public.employee_mobile_notification_preferences(business_id,employee_id,receive_incoming_text_notifications,updated_at,updated_by)
 values(p_business_id,p_employee_id,p_receive_incoming_text_notifications,now(),auth.uid())
 on conflict(business_id,employee_id) do update set receive_incoming_text_notifications=excluded.receive_incoming_text_notifications,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
end;
$$;
revoke all on function public.set_employee_mobile_notification_preference(uuid,uuid,boolean) from public;
grant execute on function public.set_employee_mobile_notification_preference(uuid,uuid,boolean) to authenticated;
