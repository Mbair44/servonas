-- Run after 20260724001100_epic_7_checkpoint_3_address_intelligence.sql.
-- Every failing_rows value must be zero. Both RLS rows must be true.
select 'missing_private_geocoding_state' as audit,count(*) as failing_rows
from public.service_locations sl
left join public.service_location_geocoding sg
  on sg.business_id=sl.business_id and sg.service_location_id=sl.id
where sg.service_location_id is null
union all
select 'cross_tenant_private_geocoding_state',count(*)
from public.service_location_geocoding sg
left join public.service_locations sl
  on sl.business_id=sg.business_id and sl.id=sg.service_location_id
where sl.id is null
union all
select 'coordinate_pair_mismatch',count(*)
from public.service_locations
where (latitude is null)<>(longitude is null)
union all
select 'untrusted_authoritative_coordinates',count(*)
from public.service_locations
where latitude is not null and geocoding_status not in ('verified','manual')
union all
select 'trusted_status_without_coordinates',count(*)
from public.service_locations
where geocoding_status in ('verified','manual') and latitude is null
union all
select 'current_fingerprint_mismatch',count(*)
from public.service_locations sl
join public.service_location_geocoding sg
  on sg.business_id=sl.business_id and sg.service_location_id=sl.id
where sg.current_address_fingerprint<>public.service_location_address_fingerprint(
  sl.street_address,sl.unit,sl.city,sl.state,sl.postal_code,sl.country
)
union all
select 'manual_override_state_mismatch',count(*)
from public.service_locations
where manual_coordinate_override<>(geocoding_status='manual' and coordinate_source='manual');

select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('service_location_geocoding','service_location_geocoding_events')
order by c.relname;

select conrelid::regclass as table_name,conname,convalidated
from pg_constraint
where conrelid in (
  'public.service_locations'::regclass,
  'public.service_location_geocoding'::regclass,
  'public.service_location_geocoding_events'::regclass
)
and contype in ('c','f')
order by conrelid::regclass::text,conname;

