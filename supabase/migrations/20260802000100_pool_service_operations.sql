begin;

create table public.pool_service_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled_chemistry_fields text[] not null default array['free_chlorine_ppm','ph','total_alkalinity_ppm','cyanuric_acid_ppm','calcium_hardness_ppm','salt_ppm','water_temperature_f'],
 weather_alerts_enabled boolean not null default false,
 wind_threshold_mph numeric(6,2) not null default 30,
 rain_threshold_inches numeric(6,2) not null default 1,
 heat_threshold_f numeric(6,2) not null default 110,
 freeze_threshold_f numeric(6,2) not null default 32,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 check(enabled_chemistry_fields<@array['free_chlorine_ppm','ph','total_alkalinity_ppm','cyanuric_acid_ppm','calcium_hardness_ppm','salt_ppm','water_temperature_f']),
 check(wind_threshold_mph>=0 and rain_threshold_inches>=0)
);

create table public.pool_chemistry_ranges(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 field_key text not null, minimum_value numeric, maximum_value numeric, consecutive_visits smallint not null default 2,
 unique(business_id,field_key),
 check(field_key in('free_chlorine_ppm','ph','total_alkalinity_ppm','cyanuric_acid_ppm','calcium_hardness_ppm','salt_ppm','water_temperature_f')),
 check(minimum_value is null or maximum_value is null or minimum_value<=maximum_value), check(consecutive_visits between 1 and 10)
);

create table public.pool_chemical_catalog(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, default_unit text, active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), unique(business_id,name), check(length(btrim(name)) between 1 and 100)
);
create table public.pool_checklist_templates(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 label text not null, active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), unique(business_id,label), check(length(btrim(label)) between 1 and 150)
);

create table public.pool_service_logs(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 job_id uuid not null, customer_id uuid not null, service_location_id uuid not null, technician_id uuid,
 status text not null default 'draft' check(status in('draft','completed')),
 free_chlorine_ppm numeric(8,2), ph numeric(5,2), total_alkalinity_ppm numeric(8,2), cyanuric_acid_ppm numeric(8,2),
 calcium_hardness_ppm numeric(8,2), salt_ppm numeric(10,2), water_temperature_f numeric(6,2), notes text,
 completed_at timestamptz, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,job_id), unique(business_id,id),
 foreign key(business_id,job_id) references public.jobs(business_id,id) on delete cascade,
 foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade,
 foreign key(business_id,service_location_id) references public.service_locations(business_id,id) on delete cascade,
 foreign key(business_id,technician_id) references public.technician_profiles(business_id,id) on delete set null,
 check(notes is null or length(notes)<=4000), check(ph is null or ph between 0 and 14)
);
create index pool_service_logs_history_idx on public.pool_service_logs(business_id,service_location_id,completed_at desc);

create table public.pool_service_log_chemicals(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 pool_service_log_id uuid not null, chemical_catalog_id uuid references public.pool_chemical_catalog(id) on delete set null,
 chemical_name text not null, amount numeric(10,3) not null, unit text not null, estimated_cost_cents integer,
 created_at timestamptz not null default now(), foreign key(business_id,pool_service_log_id) references public.pool_service_logs(business_id,id) on delete cascade,
 check(length(btrim(chemical_name)) between 1 and 100),check(amount>0),check(length(btrim(unit)) between 1 and 30),check(estimated_cost_cents is null or estimated_cost_cents>=0)
);
create table public.pool_service_log_checklist(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 pool_service_log_id uuid not null,checklist_template_id uuid references public.pool_checklist_templates(id) on delete set null,
 task_label text not null,completed boolean not null default false,completed_at timestamptz,
 foreign key(business_id,pool_service_log_id) references public.pool_service_logs(business_id,id) on delete cascade,
 check(length(btrim(task_label)) between 1 and 150)
);

create table public.pool_weather_alert_dismissals(
 business_id uuid not null references public.businesses(id) on delete cascade,event_key text not null,dismissed_by uuid references auth.users(id),dismissed_at timestamptz not null default now(),primary key(business_id,event_key)
);

create or replace function public.enforce_pool_service_business() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.businesses where id=new.business_id and industry_profile='pool_service') then
  raise exception 'Pool Service feature is unavailable for this business type' using errcode='42501';
 end if;
 return new;
end;$$;
create trigger pool_settings_industry_guard before insert or update on public.pool_service_settings for each row execute function public.enforce_pool_service_business();
create trigger pool_ranges_industry_guard before insert or update on public.pool_chemistry_ranges for each row execute function public.enforce_pool_service_business();
create trigger pool_catalog_industry_guard before insert or update on public.pool_chemical_catalog for each row execute function public.enforce_pool_service_business();
create trigger pool_checklist_industry_guard before insert or update on public.pool_checklist_templates for each row execute function public.enforce_pool_service_business();
create trigger pool_logs_industry_guard before insert or update on public.pool_service_logs for each row execute function public.enforce_pool_service_business();
create trigger pool_weather_industry_guard before insert or update on public.pool_weather_alert_dismissals for each row execute function public.enforce_pool_service_business();

alter table public.pool_service_settings enable row level security;
alter table public.pool_chemistry_ranges enable row level security;
alter table public.pool_chemical_catalog enable row level security;
alter table public.pool_checklist_templates enable row level security;
alter table public.pool_service_logs enable row level security;
alter table public.pool_service_log_chemicals enable row level security;
alter table public.pool_service_log_checklist enable row level security;
alter table public.pool_weather_alert_dismissals enable row level security;

create policy "members read pool settings" on public.pool_service_settings for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage pool settings" on public.pool_service_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read pool ranges" on public.pool_chemistry_ranges for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage pool ranges" on public.pool_chemistry_ranges for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read pool chemicals" on public.pool_chemical_catalog for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage pool chemicals" on public.pool_chemical_catalog for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read pool checklist" on public.pool_checklist_templates for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage pool checklist" on public.pool_checklist_templates for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read pool logs" on public.pool_service_logs for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage pool logs" on public.pool_service_logs for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "assigned techs read pool logs" on public.pool_service_logs for select to authenticated using(exists(select 1 from public.jobs j join public.technician_profiles t on t.id=j.assigned_technician_id and t.business_id=j.business_id where j.id=job_id and j.business_id=pool_service_logs.business_id and t.member_user_id=auth.uid() and t.is_active));
create policy "assigned techs manage pool logs" on public.pool_service_logs for all to authenticated using(exists(select 1 from public.jobs j join public.technician_profiles t on t.id=j.assigned_technician_id and t.business_id=j.business_id where j.id=job_id and j.business_id=pool_service_logs.business_id and t.member_user_id=auth.uid() and t.is_active)) with check(exists(select 1 from public.jobs j join public.technician_profiles t on t.id=j.assigned_technician_id and t.business_id=j.business_id where j.id=job_id and j.business_id=pool_service_logs.business_id and t.member_user_id=auth.uid() and t.is_active));
create policy "members read pool log chemicals" on public.pool_service_log_chemicals for select to authenticated using(public.is_business_member(business_id));
create policy "pool log chemical writers" on public.pool_service_log_chemicals for all to authenticated using(public.is_business_member(business_id) and exists(select 1 from public.pool_service_logs l where l.id=pool_service_log_id and l.business_id=pool_service_log_chemicals.business_id)) with check(public.is_business_member(business_id) and exists(select 1 from public.pool_service_logs l where l.id=pool_service_log_id and l.business_id=pool_service_log_chemicals.business_id));
create policy "members read pool log checklist" on public.pool_service_log_checklist for select to authenticated using(public.is_business_member(business_id));
create policy "pool log checklist writers" on public.pool_service_log_checklist for all to authenticated using(public.is_business_member(business_id) and exists(select 1 from public.pool_service_logs l where l.id=pool_service_log_id and l.business_id=pool_service_log_checklist.business_id)) with check(public.is_business_member(business_id) and exists(select 1 from public.pool_service_logs l where l.id=pool_service_log_id and l.business_id=pool_service_log_checklist.business_id));
create policy "members read weather dismissals" on public.pool_weather_alert_dismissals for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage weather dismissals" on public.pool_weather_alert_dismissals for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));

create trigger pool_service_settings_updated_at before update on public.pool_service_settings for each row execute function public.set_routing_updated_at();
create trigger pool_service_logs_updated_at before update on public.pool_service_logs for each row execute function public.set_routing_updated_at();

comment on table public.pool_service_logs is 'Pool-only visit facts. Structured for future provider-neutral or AI-generated insights without storing recommendations today.';
comment on table public.pool_weather_alert_dismissals is 'User decisions for provider-neutral weather events; weather never automatically changes scheduled work.';
notify pgrst,'reload schema';
commit;
