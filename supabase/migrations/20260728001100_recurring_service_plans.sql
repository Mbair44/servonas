begin;

alter table public.recurring_service_series
 add column if not exists name text,
 add column if not exists status text not null default 'draft',
 add column if not exists start_date date,
 add column if not exists end_date date,
 add column if not exists first_recurring_date date,
 add column if not exists initial_service_required boolean not null default false,
 add column if not exists initial_service_date date,
 add column if not exists initial_service_price numeric(12,2) not null default 0,
 add column if not exists initial_service_duration_minutes integer,
 add column if not exists initial_service_description text,
 add column if not exists recurring_price numeric(12,2) not null default 0,
 add column if not exists taxable boolean not null default false,
 add column if not exists default_discount numeric(12,2) not null default 0,
 add column if not exists default_fee numeric(12,2) not null default 0,
 add column if not exists billing_rule text not null default 'after_each_completed_service',
 add column if not exists default_duration_minutes integer not null default 60,
 add column if not exists default_employee_id uuid,
 add column if not exists territory_id uuid,
 add column if not exists preferred_day_of_week smallint,
 add column if not exists preferred_time_window text not null default 'no_preference',
 add column if not exists scheduling_flexibility text,
 add column if not exists last_generated_through date,
 add column if not exists paused_at timestamptz,
 add column if not exists pause_reason text,
 add column if not exists resume_on date,
 add column if not exists canceled_at timestamptz,
 add column if not exists cancellation_reason text;

update public.recurring_service_series set
 name=coalesce(name,'Recurring service'),
 status=case when is_active then 'active' else 'paused' end,
 start_date=coalesce(start_date,next_due_on,current_date),
 first_recurring_date=coalesce(first_recurring_date,next_due_on,current_date),
 next_due_on=coalesce(next_due_on,current_date)
where name is null or start_date is null or first_recurring_date is null;

alter table public.recurring_service_series alter column name set not null;
alter table public.recurring_service_series alter column start_date set not null;
alter table public.recurring_service_series alter column first_recurring_date set not null;
alter table public.recurring_service_series drop constraint if exists recurring_service_plan_status_check;
alter table public.recurring_service_series add constraint recurring_service_plan_status_check check(status in('draft','active','paused','canceled','completed','expired'));
alter table public.recurring_service_series drop constraint if exists recurring_service_plan_dates_check;
alter table public.recurring_service_series add constraint recurring_service_plan_dates_check check(end_date is null or end_date>=start_date);
alter table public.recurring_service_series drop constraint if exists recurring_service_plan_money_check;
alter table public.recurring_service_series add constraint recurring_service_plan_money_check check(initial_service_price>=0 and recurring_price>=0 and default_discount>=0 and default_fee>=0);
alter table public.recurring_service_series drop constraint if exists recurring_service_plan_duration_check;
alter table public.recurring_service_series add constraint recurring_service_plan_duration_check check(default_duration_minutes between 1 and 10080 and (initial_service_duration_minutes is null or initial_service_duration_minutes between 1 and 10080));
alter table public.recurring_service_series drop constraint if exists recurring_service_plan_billing_check;
alter table public.recurring_service_series add constraint recurring_service_plan_billing_check check(billing_rule='after_each_completed_service');

create table if not exists public.service_plan_occurrences(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 service_plan_id uuid not null,
 occurrence_date date not null,
 occurrence_key text not null,
 occurrence_type text not null default 'recurring' check(occurrence_type in('initial','recurring','manual','follow_up')),
 status text not null default 'pending' check(status in('pending','generated','skipped','canceled','completed')),
 generated_job_id uuid,
 skipped_at timestamptz,skipped_by uuid references auth.users(id),skip_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,service_plan_id,occurrence_date,occurrence_type),
 unique(business_id,occurrence_key),
 unique(business_id,generated_job_id),
 foreign key(business_id,service_plan_id) references public.recurring_service_series(business_id,id) on delete cascade
);

alter table public.jobs
 add column if not exists service_plan_occurrence_id uuid,
 add column if not exists occurrence_date date,
 add column if not exists generation_type text,
 add column if not exists service_description_snapshot text,
 add column if not exists recurring_unit_price_snapshot numeric(12,2),
 add column if not exists recurring_taxable_snapshot boolean,
 add column if not exists price_effective_at timestamptz;
alter table public.jobs drop constraint if exists jobs_generation_type_check;
alter table public.jobs add constraint jobs_generation_type_check check(generation_type is null or generation_type in('initial','recurring','manual','follow_up'));
create unique index if not exists jobs_service_plan_occurrence_unique on public.jobs(business_id,service_plan_occurrence_id) where service_plan_occurrence_id is not null;

alter table public.service_plan_occurrences add constraint service_plan_occurrence_job_fk foreign key(business_id,generated_job_id) references public.jobs(business_id,id) on delete set null;
alter table public.jobs add constraint jobs_service_plan_occurrence_fk foreign key(business_id,service_plan_occurrence_id) references public.service_plan_occurrences(business_id,id) on delete set null;

create table if not exists public.service_plan_audit_events(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,service_plan_id uuid not null,
 occurrence_id uuid,job_id uuid,event_type text not null,actor_user_id uuid references auth.users(id),
 previous_value jsonb,new_value jsonb,created_at timestamptz not null default now(),
 foreign key(business_id,service_plan_id) references public.recurring_service_series(business_id,id) on delete cascade
);
create index if not exists service_plan_audit_plan_created_idx on public.service_plan_audit_events(business_id,service_plan_id,created_at desc);

alter table public.service_plan_occurrences enable row level security;
alter table public.service_plan_audit_events enable row level security;
create policy "members read service plan occurrences" on public.service_plan_occurrences for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage service plan occurrences" on public.service_plan_occurrences for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read service plan audit" on public.service_plan_audit_events for select to authenticated using(public.is_business_member(business_id));
create policy "managers create service plan audit" on public.service_plan_audit_events for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.service_plan_occurrence_date(p_anchor date,p_value integer,p_unit text,p_index integer)
returns date language plpgsql immutable as $$
declare v_result date;v_months integer;v_anchor_last boolean;
begin
 if p_value<1 or p_index<0 or p_unit not in('day','week','month','year') then raise exception 'Invalid recurrence' using errcode='22023';end if;
 if p_unit='day' then return p_anchor+(p_value*p_index);end if;
 if p_unit='week' then return p_anchor+(p_value*p_index*7);end if;
 v_months:=p_value*p_index*(case when p_unit='year' then 12 else 1 end);
 v_anchor_last=p_anchor=(date_trunc('month',p_anchor)+interval '1 month - 1 day')::date;
 v_result=(date_trunc('month',p_anchor)+(v_months||' months')::interval)::date;
 return v_result+case when v_anchor_last then extract(day from (v_result+interval '1 month - 1 day'))::integer-1 else least(extract(day from p_anchor)::integer,extract(day from (v_result+interval '1 month - 1 day'))::integer)-1 end;
end$$;

create or replace function public.generate_service_plan_jobs(p_plan_id uuid,p_horizon_days integer default 60)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.recurring_service_series%rowtype;b public.businesses%rowtype;d date;i integer:=0;o public.service_plan_occurrences%rowtype;j uuid;v_count integer:=0;v_address text;v_start timestamptz;v_today date;
begin
 select * into p from public.recurring_service_series where id=p_plan_id for update;
 if not found or not public.has_business_role(p.business_id,array['owner','admin','manager']) then raise exception 'Service plan not found' using errcode='42501';end if;
 if p.status<>'active' then return jsonb_build_object('generated',0,'status',p.status);end if;
 select * into b from public.businesses where id=p.business_id;
 v_today=(now() at time zone coalesce(b.timezone,'America/Phoenix'))::date;
 select concat_ws(', ',street_address,nullif(unit,''),city,state,postal_code) into v_address from public.service_locations where id=p.service_location_id and business_id=p.business_id;
 if p.initial_service_required and p.initial_service_date is not null then
  insert into public.service_plan_occurrences(business_id,service_plan_id,occurrence_date,occurrence_key,occurrence_type)
  values(p.business_id,p.id,p.initial_service_date,p.id||':initial:'||p.initial_service_date,'initial') on conflict do nothing;
 end if;
 loop
  d=public.service_plan_occurrence_date(p.first_recurring_date,p.cadence_interval,p.cadence_unit,i);exit when d>v_today+least(greatest(p_horizon_days,1),365) or (p.end_date is not null and d>p.end_date);
  if d>=v_today then insert into public.service_plan_occurrences(business_id,service_plan_id,occurrence_date,occurrence_key) values(p.business_id,p.id,d,p.id||':recurring:'||d) on conflict do nothing;end if;
  i=i+1;if i>500 then exit;end if;
 end loop;
 for o in select * from public.service_plan_occurrences where business_id=p.business_id and service_plan_id=p.id and status='pending' and occurrence_date between v_today and v_today+least(greatest(p_horizon_days,1),365) order by occurrence_date for update skip locked loop
  v_start=(o.occurrence_date::text||' 09:00')::timestamp at time zone coalesce(b.timezone,'America/Phoenix');
  insert into public.jobs(business_id,customer_id,service_location_id,service_id,recurring_service_series_id,service_plan_occurrence_id,occurrence_date,generation_type,title,description,status,starts_at,ends_at,service_address,estimated_duration_minutes,subtotal,tax_amount,discount_amount,service_description_snapshot,recurring_unit_price_snapshot,recurring_taxable_snapshot,price_effective_at,created_by,updated_by)
  values(p.business_id,p.customer_id,p.service_location_id,p.service_id,p.id,o.id,o.occurrence_date,o.occurrence_type,p.name,case when o.occurrence_type='initial' then p.initial_service_description else null end,'scheduled',v_start,v_start+make_interval(mins=>case when o.occurrence_type='initial' then coalesce(p.initial_service_duration_minutes,p.default_duration_minutes) else p.default_duration_minutes end),v_address,case when o.occurrence_type='initial' then coalesce(p.initial_service_duration_minutes,p.default_duration_minutes) else p.default_duration_minutes end,case when o.occurrence_type='initial' then p.initial_service_price else p.recurring_price+p.default_fee end,0,p.default_discount,coalesce(p.initial_service_description,p.name),case when o.occurrence_type='initial' then p.initial_service_price else p.recurring_price end,p.taxable,now(),auth.uid(),auth.uid())
  on conflict(business_id,service_plan_occurrence_id) where service_plan_occurrence_id is not null do nothing returning id into j;
  if j is not null then update public.service_plan_occurrences set generated_job_id=j,status='generated',updated_at=now() where id=o.id;insert into public.service_plan_audit_events(business_id,service_plan_id,occurrence_id,job_id,event_type,actor_user_id,new_value)values(p.business_id,p.id,o.id,j,'job_generated',auth.uid(),jsonb_build_object('occurrence_date',o.occurrence_date));v_count=v_count+1;end if;j=null;
 end loop;
 update public.recurring_service_series set last_generated_through=v_today+least(greatest(p_horizon_days,1),365),next_due_on=(select min(occurrence_date) from public.service_plan_occurrences where service_plan_id=p.id and status in('pending','generated') and occurrence_date>=v_today),updated_at=now(),updated_by=auth.uid() where id=p.id;
 return jsonb_build_object('generated',v_count);
end$$;
revoke all on function public.generate_service_plan_jobs(uuid,integer) from public;
grant execute on function public.generate_service_plan_jobs(uuid,integer) to authenticated;

create or replace function public.change_service_plan_status(p_plan_id uuid,p_status text,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare p public.recurring_service_series%rowtype;v_previous text;
begin
 select * into p from public.recurring_service_series where id=p_plan_id for update;
 if not found or not public.has_business_role(p.business_id,array['owner','admin','manager']) then raise exception 'Service plan not found' using errcode='42501';end if;
 if p_status not in('active','paused','canceled') then raise exception 'Invalid service plan status' using errcode='22023';end if;
 v_previous=p.status;
 update public.recurring_service_series set status=p_status,is_active=p_status='active',
  paused_at=case when p_status='paused' then now() else paused_at end,pause_reason=case when p_status='paused' then nullif(btrim(p_reason),'') else pause_reason end,
  canceled_at=case when p_status='canceled' then now() else canceled_at end,cancellation_reason=case when p_status='canceled' then nullif(btrim(p_reason),'') else cancellation_reason end,
  updated_at=now(),updated_by=auth.uid() where id=p.id;
 insert into public.service_plan_audit_events(business_id,service_plan_id,event_type,actor_user_id,previous_value,new_value)
 values(p.business_id,p.id,'service_plan_'||p_status,auth.uid(),jsonb_build_object('status',v_previous),jsonb_build_object('status',p_status,'reason',nullif(btrim(p_reason),'')));
end$$;
revoke all on function public.change_service_plan_status(uuid,text,text) from public;
grant execute on function public.change_service_plan_status(uuid,text,text) to authenticated;

create or replace function public.skip_next_service_plan_occurrence(p_plan_id uuid,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.recurring_service_series%rowtype;o public.service_plan_occurrences%rowtype;
begin
 select * into p from public.recurring_service_series where id=p_plan_id for update;
 if not found or not public.has_business_role(p.business_id,array['owner','admin','manager']) then raise exception 'Service plan not found' using errcode='42501';end if;
 select * into o from public.service_plan_occurrences where business_id=p.business_id and service_plan_id=p.id and status in('pending','generated') and occurrence_date>=current_date order by occurrence_date for update skip locked limit 1;
 if not found then raise exception 'No upcoming occurrence is available to skip' using errcode='P0002';end if;
 if o.generated_job_id is not null then update public.jobs set status='canceled',canceled_at=now(),cancellation_reason='Service plan occurrence skipped',updated_at=now(),updated_by=auth.uid() where id=o.generated_job_id and status not in('completed','canceled');end if;
 update public.service_plan_occurrences set status='skipped',skipped_at=now(),skipped_by=auth.uid(),skip_reason=nullif(btrim(p_reason),''),updated_at=now() where id=o.id;
 insert into public.service_plan_audit_events(business_id,service_plan_id,occurrence_id,job_id,event_type,actor_user_id,new_value)values(p.business_id,p.id,o.id,o.generated_job_id,'occurrence_skipped',auth.uid(),jsonb_build_object('occurrence_date',o.occurrence_date,'reason',nullif(btrim(p_reason),'')));
 return o.id;
end$$;
revoke all on function public.skip_next_service_plan_occurrence(uuid,text) from public;
grant execute on function public.skip_next_service_plan_occurrence(uuid,text) to authenticated;

comment on table public.recurring_service_series is 'Durable Service Plans owning recurrence, location, assignment, and pricing defaults.';
commit;
