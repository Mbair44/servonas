begin;

-- Tenant audit/history rows remain immutable for every normal request. The only
-- exception is the existing, explicitly-confirmed platform-admin tenant erasure
-- RPC below. The transaction-local flag cannot authorize an erasure by itself.
create or replace function public.permanent_business_delete_authorized()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select current_setting('servonas.permanent_business_delete',true)='on'
    and public.is_servonas_platform_admin();
$$;
revoke all on function public.permanent_business_delete_authorized() from public;

create or replace function public.prevent_financial_activity_delete()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  raise exception 'Financial activity records cannot be deleted' using errcode='23514';
end; $$;

create or replace function public.guard_workforce_history_immutability()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  if current_setting('servonas.history_maintenance',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Workforce history is immutable' using errcode='23514';
end $$;

create or replace function public.guard_territory_audit_immutability()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  if current_setting('servonas.history_maintenance',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Territory audit history is immutable' using errcode='23514';
end $$;

create or replace function public.guard_employee_activation_events()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  raise exception 'Employee activation history is immutable' using errcode='23514';
end $$;

create or replace function public.prevent_employee_import_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  raise exception 'Employee import audit events are immutable' using errcode='42501';
end $$;

create or replace function public.prevent_customer_import_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  raise exception 'Customer import audit history is immutable' using errcode='42501';
end $$;

create or replace function public.prevent_onboarding_audit_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  raise exception 'Onboarding audit history is immutable' using errcode='23514';
end $$;

create or replace function public.prevent_scenario_apply_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  raise exception 'Scenario apply history is immutable' using errcode='23514';
end $$;

create or replace function public.prevent_territory_scenario_decision_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and public.permanent_business_delete_authorized() then return old; end if;
  raise exception 'Territory scenario decisions are immutable; record a new decision outcome' using errcode='23514';
end $$;

create or replace function public.admin_delete_business_permanently(
  p_business_id uuid,
  p_business_name text,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
  v_table record;
  v_rows bigint;
  v_progress boolean;
  v_pass integer := 0;
begin
  if not public.is_servonas_platform_admin() then
    raise exception 'Platform administrator access is required' using errcode='42501';
  end if;
  if p_confirmation<>'DELETE' then
    raise exception 'Permanent deletion confirmation is required' using errcode='22023';
  end if;

  select name into v_name
  from public.businesses
  where id=p_business_id and is_deleted=false
  for update;
  if v_name is null then raise exception 'Business not found' using errcode='P0002'; end if;
  if btrim(p_business_name)<>v_name then
    raise exception 'Business name confirmation does not match' using errcode='22023';
  end if;

  insert into public.platform_business_admin_events(
    business_id,business_name,event_type,actor_user_id
  ) values(p_business_id,v_name,'permanently_deleted',auth.uid());

  perform set_config('servonas.permanent_business_delete','on',true);

  -- Delete tenant-owned rows in dependency-safe passes. Some older tables use
  -- restrictive foreign keys instead of cascades, so a child may need to be
  -- removed in an earlier pass before its parent can be removed in the next.
  loop
    v_pass := v_pass+1;
    v_progress := false;

    for v_table in
      select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid=c.oid
      where n.nspname='public'
        and c.relkind in ('r','p')
        and a.attname='business_id'
        and not a.attisdropped
        and c.relname not in ('businesses','platform_business_admin_events')
      order by c.relname
    loop
      begin
        execute format('delete from public.%I where business_id=$1',v_table.relname)
          using p_business_id;
        get diagnostics v_rows = row_count;
        if v_rows>0 then v_progress := true; end if;
      exception when foreign_key_violation then
        -- A later/next pass removes the dependent row first.
        null;
      end;
    end loop;

    exit when not v_progress;
    if v_pass>=100 then
      raise exception 'Tenant deletion dependency resolution did not converge' using errcode='55000';
    end if;
  end loop;

  delete from public.businesses where id=p_business_id;
  if not found then raise exception 'Business not found' using errcode='P0002'; end if;

  perform set_config('servonas.permanent_business_delete','off',true);
end
$$;

revoke all on function public.admin_delete_business_permanently(uuid,text,text) from public;
grant execute on function public.admin_delete_business_permanently(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
