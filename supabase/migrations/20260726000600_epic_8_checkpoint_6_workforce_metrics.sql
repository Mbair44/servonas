begin;

create table public.workforce_metric_facts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  metric_type text not null,
  occurred_at timestamptz not null,
  source_type text not null,
  source_id uuid not null,
  job_id uuid,
  invoice_id uuid,
  payment_id uuid,
  technician_route_id uuid,
  route_leg_id uuid,
  count_value integer,
  amount_cents bigint,
  duration_seconds integer,
  distance_meters integer,
  rating_value numeric(4,2),
  currency char(3),
  employee_name_snapshot text not null,
  job_number_snapshot bigint,
  job_title_snapshot text,
  metadata jsonb not null default '{}',
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  constraint workforce_metric_business_fk foreign key(business_id)
    references public.businesses(id) on delete restrict,
  constraint workforce_metric_employee_fk foreign key(business_id,employee_id)
    references public.employees(business_id,id) on delete restrict,
  constraint workforce_metric_job_fk foreign key(business_id,job_id)
    references public.jobs(business_id,id) on delete restrict,
  constraint workforce_metric_invoice_fk foreign key(business_id,invoice_id)
    references public.invoices(business_id,id) on delete restrict,
  constraint workforce_metric_payment_fk foreign key(business_id,payment_id)
    references public.payments(business_id,id) on delete restrict,
  constraint workforce_metric_route_fk foreign key(business_id,technician_route_id)
    references public.technician_routes(business_id,id) on delete restrict,
  constraint workforce_metric_leg_fk foreign key(business_id,route_leg_id)
    references public.route_legs(business_id,id) on delete restrict,
  constraint workforce_metric_type_check check(metric_type in (
    'job_completed','revenue_generated','service_duration','drive_time_estimated',
    'drive_time_actual','customer_rating','callback','upsell','collection'
  )),
  constraint workforce_metric_source_check check(source_type in (
    'job','payment','route_leg','review','callback','upsell','manual','integration'
  )),
  constraint workforce_metric_count_check check(count_value is null or count_value<>0),
  constraint workforce_metric_amount_check check(amount_cents is null or amount_cents<>0),
  constraint workforce_metric_duration_check check(duration_seconds is null or duration_seconds>=0),
  constraint workforce_metric_distance_check check(distance_meters is null or distance_meters>=0),
  constraint workforce_metric_rating_check check(rating_value is null or rating_value between 0 and 5),
  constraint workforce_metric_currency_check check(currency is null or currency ~ '^[A-Z]{3}$'),
  constraint workforce_metric_metadata_check check(jsonb_typeof(metadata)='object'),
  constraint workforce_metric_value_check check(
    count_value is not null or amount_cents is not null or duration_seconds is not null
    or distance_meters is not null or rating_value is not null
  )
);

create unique index workforce_metric_source_idempotency
  on public.workforce_metric_facts(
    business_id,employee_id,metric_type,source_type,source_id
  );
create index workforce_metric_employee_timeline
  on public.workforce_metric_facts(business_id,employee_id,occurred_at desc);
create index workforce_metric_reporting
  on public.workforce_metric_facts(business_id,metric_type,occurred_at desc);
create index workforce_metric_job
  on public.workforce_metric_facts(business_id,job_id)
  where job_id is not null;

alter table public.workforce_metric_facts enable row level security;
create policy "office reads workforce metric facts" on public.workforce_metric_facts
  for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "employees read own metric facts" on public.workforce_metric_facts
  for select to authenticated using(exists(
    select 1 from public.employees employee
    where employee.business_id=workforce_metric_facts.business_id
      and employee.id=workforce_metric_facts.employee_id
      and employee.auth_user_id=auth.uid()
  ));

create or replace function public.record_workforce_metric(
  p_business_id uuid,
  p_employee_id uuid,
  p_metric_type text,
  p_occurred_at timestamptz,
  p_source_type text,
  p_source_id uuid,
  p_job_id uuid default null,
  p_count_value integer default null,
  p_amount_cents bigint default null,
  p_duration_seconds integer default null,
  p_distance_meters integer default null,
  p_rating_value numeric default null,
  p_currency text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_employee_name text;
  v_job_number bigint;
  v_job_title text;
  v_fact_id uuid;
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Not authorized to record workforce metrics' using errcode='42501';
  end if;
  if p_source_type not in ('review','callback','upsell','manual','integration') then
    raise exception 'Unsupported explicit metric source' using errcode='22023';
  end if;
  select preferred_name into v_employee_name from public.employees
    where business_id=p_business_id and id=p_employee_id;
  if v_employee_name is null then raise exception 'Employee not found' using errcode='P0002'; end if;
  if p_job_id is not null then
    select job_number,title into v_job_number,v_job_title from public.jobs
      where business_id=p_business_id and id=p_job_id;
    if v_job_number is null then raise exception 'Job not found' using errcode='P0002'; end if;
  end if;
  insert into public.workforce_metric_facts(
    business_id,employee_id,metric_type,occurred_at,source_type,source_id,job_id,
    count_value,amount_cents,duration_seconds,distance_meters,rating_value,currency,
    employee_name_snapshot,job_number_snapshot,job_title_snapshot,metadata,recorded_by
  ) values(
    p_business_id,p_employee_id,p_metric_type,p_occurred_at,p_source_type,p_source_id,p_job_id,
    p_count_value,p_amount_cents,p_duration_seconds,p_distance_meters,p_rating_value,
    upper(p_currency),v_employee_name,v_job_number,v_job_title,coalesce(p_metadata,'{}'),auth.uid()
  ) returning id into v_fact_id;
  return v_fact_id;
end $$;
revoke all on function public.record_workforce_metric(
  uuid,uuid,text,timestamptz,text,uuid,uuid,integer,bigint,integer,integer,numeric,text,jsonb
) from public;
grant execute on function public.record_workforce_metric(
  uuid,uuid,text,timestamptz,text,uuid,uuid,integer,bigint,integer,integer,numeric,text,jsonb
) to authenticated;

create or replace function public.capture_completed_job_workforce_metrics(
  p_job_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_job public.jobs%rowtype;
  v_employee_id uuid;
  v_employee_name text;
  v_duration_seconds integer;
  v_amount_cents bigint;
begin
  select * into v_job from public.jobs where id=p_job_id;
  if v_job.id is null or v_job.status<>'completed' then return; end if;

  select profile.employee_id into v_employee_id
  from public.technician_profiles profile
  where profile.business_id=v_job.business_id and profile.id=v_job.assigned_technician_id;
  if v_employee_id is null then return; end if;

  select employee.preferred_name into v_employee_name
  from public.employees employee
  where employee.business_id=v_job.business_id and employee.id=v_employee_id;
  if v_employee_name is null then return; end if;

  v_duration_seconds=case
    when v_job.work_started_at is not null and v_job.work_completed_at>=v_job.work_started_at
      then extract(epoch from (v_job.work_completed_at-v_job.work_started_at))::integer
    else null end;
  v_amount_cents=round(coalesce(v_job.total_amount,0)*100)::bigint;

  insert into public.workforce_metric_facts(
    business_id,employee_id,metric_type,occurred_at,source_type,source_id,job_id,
    count_value,employee_name_snapshot,job_number_snapshot,job_title_snapshot,metadata
  ) values(
    v_job.business_id,v_employee_id,'job_completed',coalesce(v_job.work_completed_at,v_job.updated_at),
    'job',v_job.id,v_job.id,1,v_employee_name,v_job.job_number,v_job.title,
    jsonb_build_object('status','completed')
  ) on conflict do nothing;

  if v_duration_seconds is not null then
    insert into public.workforce_metric_facts(
      business_id,employee_id,metric_type,occurred_at,source_type,source_id,job_id,
      duration_seconds,employee_name_snapshot,job_number_snapshot,job_title_snapshot
    ) values(
      v_job.business_id,v_employee_id,'service_duration',coalesce(v_job.work_completed_at,v_job.updated_at),
      'job',v_job.id,v_job.id,v_duration_seconds,v_employee_name,v_job.job_number,v_job.title
    ) on conflict do nothing;
  end if;

  if v_amount_cents>0 then
    insert into public.workforce_metric_facts(
      business_id,employee_id,metric_type,occurred_at,source_type,source_id,job_id,
      amount_cents,currency,employee_name_snapshot,job_number_snapshot,job_title_snapshot,
      metadata
    ) values(
      v_job.business_id,v_employee_id,'revenue_generated',coalesce(v_job.work_completed_at,v_job.updated_at),
      'job',v_job.id,v_job.id,v_amount_cents,'USD',v_employee_name,v_job.job_number,v_job.title,
      jsonb_build_object('recognition_basis','completed_job_total')
    ) on conflict do nothing;
  end if;
end $$;
revoke all on function public.capture_completed_job_workforce_metrics(uuid) from public;

create or replace function public.capture_job_workforce_metrics_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    perform public.capture_completed_job_workforce_metrics(new.id);
  end if;
  return new;
end $$;
create trigger jobs_capture_workforce_metrics
after insert or update of status on public.jobs
for each row execute function public.capture_job_workforce_metrics_trigger();
revoke all on function public.capture_job_workforce_metrics_trigger() from public;

create or replace function public.capture_payment_collection_workforce_metric()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_job public.jobs%rowtype;
  v_employee_id uuid;
  v_employee_name text;
  v_job_id uuid;
begin
  if new.business_id is null or new.status<>'succeeded'
    or (tg_op='UPDATE' and old.status='succeeded') then return new; end if;
  v_job_id=coalesce(new.job_id,(select invoice.job_id from public.invoices invoice
    where invoice.business_id=new.business_id and invoice.id=new.invoice_id));
  if v_job_id is null then return new; end if;
  select * into v_job from public.jobs where business_id=new.business_id and id=v_job_id;
  select profile.employee_id into v_employee_id from public.technician_profiles profile
    where profile.business_id=v_job.business_id and profile.id=v_job.assigned_technician_id;
  select employee.preferred_name into v_employee_name from public.employees employee
    where employee.business_id=new.business_id and employee.id=v_employee_id;
  if v_employee_id is null or v_employee_name is null then return new; end if;
  insert into public.workforce_metric_facts(
    business_id,employee_id,metric_type,occurred_at,source_type,source_id,job_id,
    invoice_id,payment_id,amount_cents,currency,employee_name_snapshot,
    job_number_snapshot,job_title_snapshot,metadata
  ) values(
    new.business_id,v_employee_id,'collection',coalesce(new.paid_at,new.updated_at),
    'payment',new.id,v_job.id,new.invoice_id,new.id,new.amount_cents,new.currency,
    v_employee_name,v_job.job_number,v_job.title,
    jsonb_build_object('provider',new.provider,'payment_method_type',new.payment_method_type)
  ) on conflict do nothing;
  return new;
end $$;
create trigger payments_capture_workforce_collection
after insert or update of status on public.payments
for each row execute function public.capture_payment_collection_workforce_metric();
revoke all on function public.capture_payment_collection_workforce_metric() from public;

create or replace function public.capture_route_leg_workforce_metric()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_route public.technician_routes%rowtype;
  v_employee_id uuid;
  v_employee_name text;
begin
  if new.calculation_status<>'ready'
    or (tg_op='UPDATE' and old.calculation_status='ready'
      and old.driving_duration_seconds is not distinct from new.driving_duration_seconds
      and old.driving_distance_meters is not distinct from new.driving_distance_meters)
  then return new; end if;
  select * into v_route from public.technician_routes
    where business_id=new.business_id and id=new.technician_route_id;
  select profile.employee_id into v_employee_id from public.technician_profiles profile
    where profile.business_id=new.business_id and profile.id=v_route.technician_id;
  select employee.preferred_name into v_employee_name from public.employees employee
    where employee.business_id=new.business_id and employee.id=v_employee_id;
  if v_employee_id is null or v_employee_name is null then return new; end if;
  insert into public.workforce_metric_facts(
    business_id,employee_id,metric_type,occurred_at,source_type,source_id,
    technician_route_id,route_leg_id,duration_seconds,distance_meters,
    employee_name_snapshot,metadata
  ) values(
    new.business_id,v_employee_id,'drive_time_estimated',coalesce(new.calculated_at,new.updated_at),
    'route_leg',new.id,new.technician_route_id,new.id,new.driving_duration_seconds,
    new.driving_distance_meters,v_employee_name,
    jsonb_build_object('provider',new.provider,'measurement','provider_estimate')
  ) on conflict(business_id,employee_id,metric_type,source_type,source_id)
  do update set duration_seconds=excluded.duration_seconds,distance_meters=excluded.distance_meters,
    occurred_at=excluded.occurred_at,metadata=excluded.metadata,recorded_at=now();
  return new;
end $$;
create trigger route_legs_capture_workforce_metric
after insert or update of calculation_status,driving_duration_seconds,driving_distance_meters
on public.route_legs for each row execute function public.capture_route_leg_workforce_metric();
revoke all on function public.capture_route_leg_workforce_metric() from public;

-- Existing completions are snapshotted once. The assigned technician stored on
-- the completed job is used because no earlier trustworthy employee fact exists.
do $$
declare item record;
begin
  for item in select id from public.jobs
    where status='completed' and assigned_technician_id is not null
  loop
    perform public.capture_completed_job_workforce_metrics(item.id);
  end loop;
end $$;

comment on table public.workforce_metric_facts is
  'Historical, tenant-scoped employee operational facts. Values use cents, seconds, and meters; display conversion belongs in the UI.';
comment on column public.workforce_metric_facts.employee_name_snapshot is
  'Employee display name at capture time so historical reporting does not reinterpret renamed employees.';
comment on column public.workforce_metric_facts.metric_type is
  'Only supported source facts are automatically captured. Ratings, callbacks, upsells, and actual travel remain empty until authoritative workflows provide them.';

commit;
