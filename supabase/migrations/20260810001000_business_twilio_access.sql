begin;

create table public.business_twilio_access(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 enabled_at timestamptz,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
create table public.business_twilio_access_audit(
 id bigint generated always as identity primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 previous_enabled boolean not null,enabled boolean not null,
 changed_by uuid references auth.users(id) on delete set null,
 reason text not null,occurred_at timestamptz not null default now()
);
create index business_twilio_access_audit_timeline on public.business_twilio_access_audit(business_id,occurred_at desc);

-- Preserve existing tenant Twilio behavior while requiring explicit access for new tenants.
insert into public.business_twilio_access(business_id,enabled,enabled_at)
select business_id,true,now() from public.business_twilio_accounts
where provisioning_status in('active','provisioning')
on conflict(business_id) do nothing;

alter table public.business_twilio_access enable row level security;
alter table public.business_twilio_access_audit enable row level security;
create policy "business admins read Twilio access" on public.business_twilio_access for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin']));
revoke insert,update,delete on public.business_twilio_access from anon,authenticated;
revoke all on public.business_twilio_access_audit from anon,authenticated;

create or replace function public.admin_set_business_twilio_access(p_business_id uuid,p_enabled boolean,p_changed_by uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_previous boolean;
begin
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Administrative reason is required' using errcode='22023';end if;
 if not exists(select 1 from public.businesses where id=p_business_id and is_deleted=false) then raise exception 'Business not found' using errcode='P0002';end if;
 select enabled into v_previous from public.business_twilio_access where business_id=p_business_id for update;
 v_previous:=coalesce(v_previous,false);if v_previous=p_enabled then return false;end if;
 insert into public.business_twilio_access(business_id,enabled,enabled_at,updated_at,updated_by)
 values(p_business_id,p_enabled,case when p_enabled then now() else null end,now(),p_changed_by)
 on conflict(business_id) do update set enabled=excluded.enabled,enabled_at=excluded.enabled_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into public.business_twilio_access_audit(business_id,previous_enabled,enabled,changed_by,reason)
 values(p_business_id,v_previous,p_enabled,p_changed_by,trim(p_reason));return true;
end $$;
revoke all on function public.admin_set_business_twilio_access(uuid,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_set_business_twilio_access(uuid,boolean,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
