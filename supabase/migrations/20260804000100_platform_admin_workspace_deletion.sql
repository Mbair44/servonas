begin;

alter table public.businesses
 add column if not exists is_deleted boolean not null default false,
 add column if not exists deleted_at timestamptz,
 add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create table if not exists public.workspace_deletion_events(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null,
 business_name text not null,
 created_at timestamptz not null default now()
);

alter table public.workspace_deletion_events enable row level security;
drop policy if exists "owners read workspace deletion events" on public.workspace_deletion_events;
drop policy if exists "platform admins read workspace deletion events" on public.workspace_deletion_events;
create policy "platform admins read workspace deletion events"
 on public.workspace_deletion_events for select to authenticated
 using(public.is_servonas_platform_admin());

create or replace function public.delete_owned_workspace(p_business_id uuid,p_confirmation text)
returns void language plpgsql security definer set search_path=public as $$
declare v_business public.businesses;
begin
 if not public.is_servonas_platform_admin() then
  raise exception 'Only a confirmed Servonas administrator can delete a workspace' using errcode='42501';
 end if;

 select * into v_business from public.businesses where id=p_business_id and is_deleted=false for update;
 if v_business.id is null then raise exception 'Workspace not found' using errcode='P0002';end if;
 if btrim(coalesce(p_confirmation,''))<>v_business.name then raise exception 'Workspace name confirmation does not match' using errcode='22023';end if;

 insert into public.workspace_deletion_events(business_id,actor_user_id,business_name)
 values(v_business.id,auth.uid(),v_business.name);
 update public.booking_settings set enabled=false,updated_at=now(),updated_by=auth.uid() where business_id=v_business.id;
 update public.business_website_settings set status='draft',published_at=null,updated_at=now(),updated_by=auth.uid() where business_id=v_business.id;
 update public.business_entitlements set status='canceled',ends_at=coalesce(ends_at,now()),updated_at=now(),updated_by=auth.uid() where business_id=v_business.id and status<>'canceled';
 update public.business_platform_subscriptions set status='canceled',cancel_at_period_end=false,updated_at=now() where business_id=v_business.id;
 update public.businesses set is_deleted=true,deleted_at=now(),deleted_by=auth.uid(),updated_at=now() where id=v_business.id;
end$$;

revoke all on function public.delete_owned_workspace(uuid,text) from public;
grant execute on function public.delete_owned_workspace(uuid,text) to authenticated;
comment on function public.delete_owned_workspace(uuid,text) is
 'Soft-deletes a workspace after external cleanup; restricted to confirmed @servonas.com platform administrators.';

notify pgrst, 'reload schema';
commit;
