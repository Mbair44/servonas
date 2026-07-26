-- Epic 7, Checkpoint 18: immutable tenant-scoped routing audit events.
begin;

create table public.route_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  route_plan_id uuid,
  technician_route_id uuid,
  route_stop_id uuid,
  job_id uuid,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint route_audit_plan_tenant_fk foreign key (business_id,route_plan_id)
    references public.route_plans(business_id,id) on delete cascade,
  constraint route_audit_route_tenant_fk foreign key (business_id,technician_route_id)
    references public.technician_routes(business_id,id) on delete cascade,
  constraint route_audit_stop_tenant_fk foreign key (business_id,route_stop_id)
    references public.route_stops(business_id,id) on delete cascade,
  constraint route_audit_job_tenant_fk foreign key (business_id,job_id)
    references public.jobs(business_id,id) on delete cascade,
  constraint route_audit_event_check check (event_type in (
    'route_plan_created','route_calculated','route_recalculated','route_marked_stale',
    'stop_reordered','job_reassigned','job_unassigned','stop_locked','stop_unlocked',
    'optimization_requested','suggestion_accepted','suggestion_dismissed',
    'origin_changed','destination_changed','manual_override_applied'
  )),
  constraint route_audit_metadata_object_check check (jsonb_typeof(metadata)='object')
);
create index route_audit_business_created_idx on public.route_audit_events(business_id,created_at desc);
create index route_audit_plan_created_idx on public.route_audit_events(route_plan_id,created_at desc)
  where route_plan_id is not null;
alter table public.route_audit_events enable row level security;
create policy "routing office reads audit events" on public.route_audit_events
  for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']));
-- Writes are intentionally service-role/trigger only.

create or replace function public.audit_route_plan_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event text;
begin
  if tg_op='INSERT' then v_event='route_plan_created';
  elsif new.calculation_status='stale' and old.calculation_status is distinct from 'stale' then v_event='route_marked_stale';
  elsif new.calculation_status in ('ready','partial','failed') and old.calculation_status in ('queued','calculating') then
    v_event=case when old.calculated_at is null then 'route_calculated' else 'route_recalculated' end;
  else return new;
  end if;
  insert into public.route_audit_events(business_id,route_plan_id,event_type,actor_user_id,metadata)
  values(new.business_id,new.id,v_event,coalesce(new.updated_by,new.created_by,auth.uid()),
    jsonb_build_object('version',new.version,'calculation_revision',new.calculation_revision,'status',new.calculation_status));
  return new;
end $$;
create trigger route_plans_audit after insert or update on public.route_plans
for each row execute function public.audit_route_plan_change();

create or replace function public.audit_route_stop_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event text;
begin
  if new.sequence is distinct from old.sequence then v_event='stop_reordered';
  elsif new.is_locked is distinct from old.is_locked then v_event=case when new.is_locked then 'stop_locked' else 'stop_unlocked' end;
  elsif new.manual_override=true and old.manual_override=false then v_event='manual_override_applied';
  else return new;
  end if;
  insert into public.route_audit_events(business_id,route_plan_id,technician_route_id,route_stop_id,job_id,event_type,actor_user_id,metadata)
  values(new.business_id,new.route_plan_id,new.technician_route_id,new.id,new.job_id,v_event,coalesce(new.updated_by,auth.uid()),
    jsonb_build_object('sequence',new.sequence));
  return new;
end $$;
create trigger route_stops_audit after update on public.route_stops
for each row execute function public.audit_route_stop_change();

create or replace function public.audit_route_suggestion_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event text;
begin
  if tg_op='INSERT' then
    insert into public.route_audit_events(business_id,route_plan_id,event_type,actor_user_id,metadata)
    values(new.business_id,new.route_plan_id,'optimization_requested',auth.uid(),jsonb_build_object('optimization_run_id',new.optimization_run_id));
    return new;
  end if;
  if new.status=old.status then return new; end if;
  v_event=case new.status when 'accepted' then 'suggestion_accepted' when 'dismissed' then 'suggestion_dismissed' else null end;
  if v_event is not null then
    insert into public.route_audit_events(business_id,route_plan_id,event_type,actor_user_id,metadata)
    values(new.business_id,new.route_plan_id,v_event,coalesce(new.accepted_by,new.dismissed_by,auth.uid()),jsonb_build_object('suggestion_id',new.id));
  end if;
  return new;
end $$;
create trigger route_suggestions_audit after insert or update on public.route_suggestions
for each row execute function public.audit_route_suggestion_change();

create or replace function public.audit_route_job_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan uuid; v_event text;
begin
  if new.assigned_technician_id is not distinct from old.assigned_technician_id then return new; end if;
  select id into v_plan from public.route_plans
    where business_id=new.business_id and service_date=(new.starts_at at time zone
      (select timezone from public.businesses where id=new.business_id))::date
    order by updated_at desc limit 1;
  v_event=case when new.assigned_technician_id is null then 'job_unassigned' else 'job_reassigned' end;
  insert into public.route_audit_events(business_id,route_plan_id,job_id,event_type,actor_user_id,metadata)
  values(new.business_id,v_plan,new.id,v_event,coalesce(new.updated_by,auth.uid()),
    jsonb_build_object('previous_technician_id',old.assigned_technician_id,'technician_id',new.assigned_technician_id));
  return new;
end $$;
create trigger jobs_route_assignment_audit after update of assigned_technician_id on public.jobs
for each row execute function public.audit_route_job_assignment();

create or replace function public.audit_route_endpoint_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_event text; v_start_changed boolean; v_end_changed boolean;
begin
  v_business=new.business_id;
  if tg_op='INSERT' then
    v_start_changed=true; v_end_changed=true;
  elsif tg_table_name='business_route_endpoint_defaults' then
    v_start_changed=row(new.start_mode,new.office_address,new.office_latitude,new.office_longitude,new.custom_start_address,new.custom_start_latitude,new.custom_start_longitude)
      is distinct from row(old.start_mode,old.office_address,old.office_latitude,old.office_longitude,old.custom_start_address,old.custom_start_latitude,old.custom_start_longitude);
    v_end_changed=row(new.end_mode,new.office_address,new.office_latitude,new.office_longitude,new.custom_end_address,new.custom_end_latitude,new.custom_end_longitude)
      is distinct from row(old.end_mode,old.office_address,old.office_latitude,old.office_longitude,old.custom_end_address,old.custom_end_latitude,old.custom_end_longitude);
  else
    v_start_changed=tg_op='INSERT' or row(new.start_mode,new.home_address,new.home_latitude,new.home_longitude,new.custom_start_address,new.custom_start_latitude,new.custom_start_longitude)
      is distinct from row(old.start_mode,old.home_address,old.home_latitude,old.home_longitude,old.custom_start_address,old.custom_start_latitude,old.custom_start_longitude);
    v_end_changed=tg_op='INSERT' or row(new.end_mode,new.home_address,new.home_latitude,new.home_longitude,new.custom_end_address,new.custom_end_latitude,new.custom_end_longitude)
      is distinct from row(old.end_mode,old.home_address,old.home_latitude,old.home_longitude,old.custom_end_address,old.custom_end_latitude,old.custom_end_longitude);
  end if;
  if v_start_changed then
    insert into public.route_audit_events(business_id,event_type,actor_user_id,metadata)
    values(v_business,'origin_changed',coalesce(new.updated_by,auth.uid()),jsonb_build_object('scope',tg_table_name));
  end if;
  if v_end_changed then
    insert into public.route_audit_events(business_id,event_type,actor_user_id,metadata)
    values(v_business,'destination_changed',coalesce(new.updated_by,auth.uid()),jsonb_build_object('scope',tg_table_name));
  end if;
  return new;
end $$;
create trigger business_route_endpoints_audit after insert or update on public.business_route_endpoint_defaults
for each row execute function public.audit_route_endpoint_change();
create trigger technician_route_endpoints_audit after insert or update on public.technician_route_endpoint_overrides
for each row execute function public.audit_route_endpoint_change();

comment on table public.route_audit_events is
  'Immutable routing audit ledger. Application users may read permitted tenant events but cannot insert, update, or delete them.';
commit;
