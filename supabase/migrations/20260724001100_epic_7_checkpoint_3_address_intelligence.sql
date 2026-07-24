-- Epic 7, Checkpoint 3: address intelligence and geocoding foundation.
-- This migration deliberately does not geocode legacy records or call an
-- external provider.
begin;

do $$
begin
  if to_regclass('public.service_locations') is null
    or to_regclass('public.route_plans') is null
    or to_regprocedure('public.mark_route_plan_stale(uuid,date)') is null then
    raise exception 'Epic 7 Checkpoint 3 requires the completed Checkpoint 2 migration';
  end if;
end $$;

alter table public.service_locations
  add column formatted_address text,
  add column normalized_address jsonb,
  add column place_provider text,
  add column provider_place_id text,
  add column coordinate_source text not null default 'unknown',
  add column geocoding_status text not null default 'not_requested',
  add column manual_coordinate_override boolean not null default false;

-- Preserve Google compatibility while making place identity provider-neutral.
update public.service_locations
set latitude=null,longitude=null
where (latitude is null) <> (longitude is null)
   or (latitude=0 and longitude=0);

update public.service_locations
set place_provider=case when google_place_id is not null then 'google' else null end,
    provider_place_id=google_place_id,
    coordinate_source=case when latitude is not null then 'legacy' else 'unknown' end,
    geocoding_status=case when latitude is not null then 'stale' else 'not_requested' end;

-- Legacy coordinates have no fingerprint proving that they still belong to the
-- current structured address. Preserve their source classification for audit,
-- but clear the values so stale coordinates cannot be treated as routable.
update public.service_locations
set latitude=null,longitude=null
where geocoding_status='stale';

alter table public.service_locations
  add constraint service_locations_coordinate_pair_check
    check ((latitude is null)=(longitude is null)),
  add constraint service_locations_zero_coordinate_placeholder_check
    check (latitude is null or latitude<>0 or longitude<>0),
  add constraint service_locations_coordinate_source_check
    check (coordinate_source in ('provider','manual','import','legacy','unknown')),
  add constraint service_locations_geocoding_status_check
    check (geocoding_status in (
      'not_requested','pending','verified','manual','stale','failed','ambiguous'
    )),
  add constraint service_locations_normalized_address_object_check
    check (normalized_address is null or jsonb_typeof(normalized_address)='object'),
  add constraint service_locations_resolution_state_check check (
    (geocoding_status in ('verified','manual') and latitude is not null)
    or (geocoding_status not in ('verified','manual') and latitude is null)
  ),
  add constraint service_locations_manual_state_check check (
    (manual_coordinate_override and geocoding_status='manual' and coordinate_source='manual')
    or not manual_coordinate_override
  ),
  add constraint service_locations_provider_identity_check check (
    (place_provider is null)=(provider_place_id is null)
  );

comment on column public.service_locations.street_address is
  'User-entered service address line 1. Provider normalization is stored separately.';
comment on column public.service_locations.normalized_address is
  'Small provider-normalized structured address; never a raw provider response.';
comment on column public.service_locations.geocoding_status is
  'Operational routability state. Internal provider errors are stored in the office-only geocoding table.';
comment on column public.service_locations.latitude is
  'Authoritative routing latitude only when geocoding_status is verified or manual.';
comment on column public.service_locations.longitude is
  'Authoritative routing longitude only when geocoding_status is verified or manual.';

create index service_locations_business_geocoding_status_idx
  on public.service_locations(business_id,geocoding_status)
  where is_deleted=false;
create index service_locations_business_provider_place_idx
  on public.service_locations(business_id,place_provider,provider_place_id)
  where provider_place_id is not null and is_deleted=false;

create or replace function public.service_location_address_fingerprint(
  p_line1 text,
  p_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country_code text
) returns text
language sql immutable parallel safe
set search_path=public,extensions
as $$
  select encode(
    digest(
      concat_ws(
        chr(31),
        lower(regexp_replace(trim(coalesce(p_line1,'')),'\s+',' ','g')),
        lower(regexp_replace(trim(coalesce(p_line2,'')),'\s+',' ','g')),
        lower(regexp_replace(trim(coalesce(p_city,'')),'\s+',' ','g')),
        lower(regexp_replace(trim(coalesce(p_region,'')),'\s+',' ','g')),
        lower(regexp_replace(trim(coalesce(p_postal_code,'')),'\s+',' ','g')),
        case upper(trim(coalesce(p_country_code,'')))
          when 'USA' then 'US'
          when 'UNITED STATES' then 'US'
          when 'UNITED STATES OF AMERICA' then 'US'
          else upper(trim(coalesce(p_country_code,'')))
        end
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create table public.service_location_geocoding (
  service_location_id uuid primary key,
  business_id uuid not null,
  current_address_fingerprint text not null,
  geocoded_address_fingerprint text,
  geocoding_provider text,
  geocoded_at timestamptz,
  last_geocoding_attempt_at timestamptz,
  last_geocoding_error_code text,
  last_geocoding_error_message text,
  address_validation_confidence text not null default 'unknown',
  partial_match boolean not null default false,
  warning_codes text[] not null default '{}'::text[],
  manual_override_at timestamptz,
  manual_override_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint service_location_geocoding_location_tenant_fk
    foreign key (business_id,service_location_id)
    references public.service_locations(business_id,id) on delete cascade,
  constraint service_location_geocoding_confidence_check
    check (address_validation_confidence in ('exact','high','medium','low','unknown')),
  constraint service_location_geocoding_fingerprint_check
    check (
      length(current_address_fingerprint)=64
      and (geocoded_address_fingerprint is null or length(geocoded_address_fingerprint)=64)
    )
);
comment on table public.service_location_geocoding is
  'Office-only geocoding state. Kept separate so assigned-technician location reads do not expose internal provider errors or fingerprints.';
create unique index service_location_geocoding_business_id_id_unique
  on public.service_location_geocoding(business_id,service_location_id);
create index service_location_geocoding_business_fingerprint_idx
  on public.service_location_geocoding(business_id,current_address_fingerprint);
create index service_location_geocoding_attempt_idx
  on public.service_location_geocoding(business_id,last_geocoding_attempt_at desc);

create table public.service_location_geocoding_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  service_location_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text not null,
  provider text,
  error_code text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint service_location_geocoding_events_location_tenant_fk
    foreign key (business_id,service_location_id)
    references public.service_locations(business_id,id) on delete cascade,
  constraint service_location_geocoding_events_type_check check (event_type in (
    'service_location_geocoding_requested',
    'service_location_geocoding_verified',
    'service_location_geocoding_failed',
    'service_location_geocoding_ambiguous',
    'service_location_geocoding_marked_stale',
    'service_location_coordinates_overridden',
    'service_location_coordinate_override_cleared'
  ))
);
comment on table public.service_location_geocoding_events is
  'Safe geocoding audit metadata. Full addresses and raw provider payloads are intentionally excluded.';
create index service_location_geocoding_events_business_location_idx
  on public.service_location_geocoding_events(business_id,service_location_id,created_at desc);

insert into public.service_location_geocoding(
  service_location_id,business_id,current_address_fingerprint
)
select
  id,
  business_id,
  public.service_location_address_fingerprint(
    street_address,unit,city,state,postal_code,country
  )
from public.service_locations;

-- Direct coordinate/status writes are blocked. Trusted RPCs set a transaction-
-- local flag after applying authorization and validation.
create or replace function public.guard_service_location_routing_write()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_old_fingerprint text;
  v_new_fingerprint text;
begin
  if current_setting('servonas.geocoding_sync',true)='on' then
    return new;
  end if;
  if tg_op='INSERT' then
    if new.latitude is not null or new.longitude is not null then
      raise exception 'Use the service-location geocoding operations to set routing coordinates'
        using errcode='check_violation';
    end if;
    return new;
  end if;

  v_old_fingerprint=public.service_location_address_fingerprint(
    old.street_address,old.unit,old.city,old.state,old.postal_code,old.country
  );
  v_new_fingerprint=public.service_location_address_fingerprint(
    new.street_address,new.unit,new.city,new.state,new.postal_code,new.country
  );
  if v_new_fingerprint<>v_old_fingerprint then
    new.latitude=null;
    new.longitude=null;
    new.formatted_address=null;
    new.normalized_address=null;
    new.place_provider=null;
    new.provider_place_id=null;
    new.google_place_id=null;
    new.coordinate_source='unknown';
    new.geocoding_status='stale';
    new.manual_coordinate_override=false;
    return new;
  end if;

  if new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.formatted_address is distinct from old.formatted_address
    or new.normalized_address is distinct from old.normalized_address
    or new.place_provider is distinct from old.place_provider
    or new.provider_place_id is distinct from old.provider_place_id
    or new.google_place_id is distinct from old.google_place_id
    or new.coordinate_source is distinct from old.coordinate_source
    or new.geocoding_status is distinct from old.geocoding_status
    or new.manual_coordinate_override is distinct from old.manual_coordinate_override then
    raise exception 'Use the service-location geocoding operations to change routing data'
      using errcode='check_violation';
  end if;
  return new;
end; $$;

create trigger service_locations_guard_routing_write
before insert or update on public.service_locations
for each row execute function public.guard_service_location_routing_write();

create or replace function public.sync_service_location_geocoding_state()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_fingerprint text;
  v_old_fingerprint text;
begin
  v_fingerprint=public.service_location_address_fingerprint(
    new.street_address,new.unit,new.city,new.state,new.postal_code,new.country
  );
  if tg_op='INSERT' then
    insert into public.service_location_geocoding(
      service_location_id,business_id,current_address_fingerprint
    ) values(new.id,new.business_id,v_fingerprint)
    on conflict(service_location_id) do update
      set current_address_fingerprint=excluded.current_address_fingerprint,updated_at=now();
    return new;
  end if;
  v_old_fingerprint=public.service_location_address_fingerprint(
    old.street_address,old.unit,old.city,old.state,old.postal_code,old.country
  );
  if v_fingerprint<>v_old_fingerprint then
    update public.service_location_geocoding
    set current_address_fingerprint=v_fingerprint,
        geocoded_address_fingerprint=null,
        geocoding_provider=null,
        geocoded_at=null,
        last_geocoding_error_code=null,
        last_geocoding_error_message=null,
        address_validation_confidence='unknown',
        partial_match=false,
        warning_codes='{}'::text[],
        manual_override_at=null,
        manual_override_by=null,
        updated_at=now()
    where business_id=new.business_id and service_location_id=new.id;
    insert into public.service_location_geocoding_events(
      business_id,service_location_id,event_type,from_status,to_status,actor_user_id
    ) values(
      new.business_id,new.id,'service_location_geocoding_marked_stale',
      old.geocoding_status,'stale',new.updated_by
    );
  end if;
  return new;
end; $$;
revoke all on function public.sync_service_location_geocoding_state() from public;

create trigger service_locations_sync_geocoding_state
after insert or update on public.service_locations
for each row execute function public.sync_service_location_geocoding_state();

create or replace function public.geocoding_mutation_allowed(p_business_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select coalesce(auth.role(),'')='service_role'
    or public.has_business_role(p_business_id,array['owner','admin','manager']);
$$;
revoke all on function public.geocoding_mutation_allowed(uuid) from public;

create or replace function public.begin_service_location_geocoding(
  p_business_id uuid,
  p_service_location_id uuid,
  p_force boolean default false,
  p_provider_place_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_location public.service_locations%rowtype;
  v_state public.service_location_geocoding%rowtype;
  v_action text;
begin
  if not public.geocoding_mutation_allowed(p_business_id) then
    raise exception 'Address resolution denied' using errcode='insufficient_privilege';
  end if;
  select * into v_location from public.service_locations
  where id=p_service_location_id and business_id=p_business_id and not is_deleted
  for update;
  if not found then raise exception 'Service location not found' using errcode='no_data_found'; end if;
  select * into v_state from public.service_location_geocoding
  where service_location_id=p_service_location_id and business_id=p_business_id
  for update;

  if v_location.geocoding_status='manual' then v_action='manual';
  elsif not p_force
    and v_location.geocoding_status='verified'
    and v_state.geocoded_address_fingerprint=v_state.current_address_fingerprint
    and v_location.latitude is not null then v_action='cached';
  elsif v_location.geocoding_status='pending'
    and v_state.last_geocoding_attempt_at>now()-interval '2 minutes' then v_action='pending';
  elsif p_force
    and v_state.last_geocoding_attempt_at>now()-interval '30 seconds' then v_action='cooldown';
  else v_action='resolve';
  end if;

  if v_action='resolve' then
    perform set_config('servonas.geocoding_sync','on',true);
    update public.service_locations
    set geocoding_status='pending',
        latitude=null,
        longitude=null,
        coordinate_source='unknown',
        manual_coordinate_override=false,
        updated_at=now(),
        updated_by=case when auth.role()='service_role' then updated_by else auth.uid() end
    where id=p_service_location_id and business_id=p_business_id;
    update public.service_location_geocoding
    set last_geocoding_attempt_at=now(),
        last_geocoding_error_code=null,
        last_geocoding_error_message=null,
        updated_at=now()
    where service_location_id=p_service_location_id and business_id=p_business_id;
    insert into public.service_location_geocoding_events(
      business_id,service_location_id,event_type,from_status,to_status,provider,actor_user_id
    ) values(
      p_business_id,p_service_location_id,'service_location_geocoding_requested',
      v_location.geocoding_status,'pending',coalesce(v_location.place_provider,'google'),
      case when auth.role()='service_role' then null else auth.uid() end
    );
  end if;

  return jsonb_build_object(
    'action',v_action,
    'fingerprint',v_state.current_address_fingerprint,
    'providerPlaceId',coalesce(nullif(trim(p_provider_place_id),''),v_location.provider_place_id),
    'address',jsonb_build_object(
      'line1',v_location.street_address,
      'line2',v_location.unit,
      'city',v_location.city,
      'region',v_location.state,
      'postalCode',v_location.postal_code,
      'countryCode',v_location.country
    )
  );
end; $$;
revoke all on function public.begin_service_location_geocoding(uuid,uuid,boolean,text) from public;
grant execute on function public.begin_service_location_geocoding(uuid,uuid,boolean,text)
  to authenticated,service_role;

create or replace function public.finish_service_location_geocoding(
  p_business_id uuid,
  p_service_location_id uuid,
  p_address_fingerprint text,
  p_status text,
  p_provider text,
  p_provider_place_id text,
  p_formatted_address text,
  p_normalized_address jsonb,
  p_latitude numeric,
  p_longitude numeric,
  p_confidence text,
  p_partial_match boolean,
  p_warning_codes text[],
  p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_location public.service_locations%rowtype;
  v_state public.service_location_geocoding%rowtype;
  v_event text;
begin
  if not public.geocoding_mutation_allowed(p_business_id) then
    raise exception 'Address resolution denied' using errcode='insufficient_privilege';
  end if;
  if p_status not in ('verified','ambiguous','failed')
    or p_confidence not in ('exact','high','medium','low','unknown') then
    raise exception 'Invalid geocoding result' using errcode='invalid_parameter_value';
  end if;
  select * into v_location from public.service_locations
  where id=p_service_location_id and business_id=p_business_id and not is_deleted
  for update;
  if not found then raise exception 'Service location not found' using errcode='no_data_found'; end if;
  select * into v_state from public.service_location_geocoding
  where service_location_id=p_service_location_id and business_id=p_business_id
  for update;
  if v_state.current_address_fingerprint<>p_address_fingerprint then
    return jsonb_build_object('status','stale');
  end if;
  if p_status='verified' and (
    p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or (p_latitude=0 and p_longitude=0)
    or p_formatted_address is null
    or p_normalized_address is null
    or jsonb_typeof(p_normalized_address)<>'object'
  ) then
    raise exception 'Verified result is incomplete' using errcode='invalid_parameter_value';
  end if;

  perform set_config('servonas.geocoding_sync','on',true);
  update public.service_locations
  set formatted_address=case when p_status='verified' then p_formatted_address else null end,
      normalized_address=case when p_status='verified' then p_normalized_address else null end,
      place_provider=case when p_status='verified' and p_provider_place_id is not null then p_provider else null end,
      provider_place_id=case when p_status='verified' then p_provider_place_id else null end,
      google_place_id=case when p_status='verified' and p_provider='google' then p_provider_place_id else null end,
      latitude=case when p_status='verified' then p_latitude else null end,
      longitude=case when p_status='verified' then p_longitude else null end,
      coordinate_source=case when p_status='verified' then 'provider' else 'unknown' end,
      geocoding_status=p_status,
      manual_coordinate_override=false,
      updated_at=now(),
      updated_by=case when auth.role()='service_role' then updated_by else auth.uid() end
  where id=p_service_location_id and business_id=p_business_id;

  update public.service_location_geocoding
  set geocoded_address_fingerprint=case when p_status='verified' then p_address_fingerprint else null end,
      geocoding_provider=p_provider,
      geocoded_at=case when p_status='verified' then now() else null end,
      last_geocoding_error_code=case when p_status='verified' then null else coalesce(p_error_code,p_status) end,
      last_geocoding_error_message=null,
      address_validation_confidence=p_confidence,
      partial_match=coalesce(p_partial_match,false),
      warning_codes=coalesce(p_warning_codes,'{}'::text[]),
      updated_at=now()
  where service_location_id=p_service_location_id and business_id=p_business_id;
  v_event=case p_status
    when 'verified' then 'service_location_geocoding_verified'
    when 'ambiguous' then 'service_location_geocoding_ambiguous'
    else 'service_location_geocoding_failed'
  end;
  insert into public.service_location_geocoding_events(
    business_id,service_location_id,event_type,from_status,to_status,provider,error_code,actor_user_id
  ) values(
    p_business_id,p_service_location_id,v_event,v_location.geocoding_status,p_status,p_provider,
    case when p_status='verified' then null else coalesce(p_error_code,p_status) end,
    case when auth.role()='service_role' then null else auth.uid() end
  );
  return jsonb_build_object('status',p_status);
end; $$;
revoke all on function public.finish_service_location_geocoding(
  uuid,uuid,text,text,text,text,text,jsonb,numeric,numeric,text,boolean,text[],text
) from public;
grant execute on function public.finish_service_location_geocoding(
  uuid,uuid,text,text,text,text,text,jsonb,numeric,numeric,text,boolean,text[],text
) to authenticated,service_role;

create or replace function public.set_service_location_manual_coordinates(
  p_business_id uuid,
  p_service_location_id uuid,
  p_latitude numeric,
  p_longitude numeric
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_from_status text;
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Coordinate override denied' using errcode='insufficient_privilege';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or (p_latitude=0 and p_longitude=0) then
    raise exception 'Invalid routing coordinates' using errcode='invalid_parameter_value';
  end if;
  select geocoding_status into v_from_status from public.service_locations
  where id=p_service_location_id and business_id=p_business_id and not is_deleted for update;
  if not found then raise exception 'Service location not found' using errcode='no_data_found'; end if;
  perform set_config('servonas.geocoding_sync','on',true);
  update public.service_locations
  set latitude=p_latitude,longitude=p_longitude,coordinate_source='manual',
      geocoding_status='manual',manual_coordinate_override=true,
      updated_at=now(),updated_by=auth.uid()
  where id=p_service_location_id and business_id=p_business_id;
  update public.service_location_geocoding
  set geocoded_address_fingerprint=current_address_fingerprint,
      geocoding_provider=null,geocoded_at=now(),
      last_geocoding_error_code=null,last_geocoding_error_message=null,
      address_validation_confidence='unknown',partial_match=false,warning_codes='{}'::text[],
      manual_override_at=now(),manual_override_by=auth.uid(),updated_at=now()
  where service_location_id=p_service_location_id and business_id=p_business_id;
  insert into public.service_location_geocoding_events(
    business_id,service_location_id,event_type,from_status,to_status,actor_user_id
  ) values(
    p_business_id,p_service_location_id,'service_location_coordinates_overridden',
    v_from_status,'manual',auth.uid()
  );
end; $$;
revoke all on function public.set_service_location_manual_coordinates(uuid,uuid,numeric,numeric) from public;
grant execute on function public.set_service_location_manual_coordinates(uuid,uuid,numeric,numeric)
  to authenticated;

create or replace function public.clear_service_location_manual_coordinates(
  p_business_id uuid,
  p_service_location_id uuid
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Coordinate override denied' using errcode='insufficient_privilege';
  end if;
  if not exists(
    select 1 from public.service_locations
    where id=p_service_location_id and business_id=p_business_id
      and not is_deleted and manual_coordinate_override
  ) then
    raise exception 'Manual coordinate override not found' using errcode='no_data_found';
  end if;
  perform set_config('servonas.geocoding_sync','on',true);
  update public.service_locations
  set latitude=null,longitude=null,coordinate_source='unknown',
      geocoding_status='stale',manual_coordinate_override=false,
      updated_at=now(),updated_by=auth.uid()
  where id=p_service_location_id and business_id=p_business_id;
  update public.service_location_geocoding
  set geocoded_address_fingerprint=null,geocoded_at=null,
      manual_override_at=null,manual_override_by=null,updated_at=now()
  where service_location_id=p_service_location_id and business_id=p_business_id;
  insert into public.service_location_geocoding_events(
    business_id,service_location_id,event_type,from_status,to_status,actor_user_id
  ) values(
    p_business_id,p_service_location_id,'service_location_coordinate_override_cleared',
    'manual','stale',auth.uid()
  );
end; $$;
revoke all on function public.clear_service_location_manual_coordinates(uuid,uuid) from public;
grant execute on function public.clear_service_location_manual_coordinates(uuid,uuid)
  to authenticated;

alter table public.service_location_geocoding enable row level security;
alter table public.service_location_geocoding_events enable row level security;
create policy "geocoding office reads state" on public.service_location_geocoding
  for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "geocoding office reads events" on public.service_location_geocoding_events
  for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']));

commit;
