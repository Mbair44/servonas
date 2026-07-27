begin;

alter table public.workforce_territories
  drop constraint workforce_territories_type_check;
alter table public.workforce_territories
  add constraint workforce_territories_type_check check(territory_type in (
    'postal_codes','neighborhoods','polygon','radius','city_boundaries',
    'delivery_zone','service_area','mixed'
  ));

alter table public.workforce_territories
  add constraint workforce_territories_radius_strategy_check check(
    territory_type<>'radius' or (
      jsonb_typeof(strategy_config->'center')='object'
      and jsonb_typeof(strategy_config->'center'->'latitude')='number'
      and jsonb_typeof(strategy_config->'center'->'longitude')='number'
      and (strategy_config->'center'->>'latitude')::numeric between -90 and 90
      and (strategy_config->'center'->>'longitude')::numeric between -180 and 180
      and jsonb_typeof(strategy_config->'radius_meters')='number'
      and (strategy_config->>'radius_meters')::numeric>0
      and (strategy_config->>'radius_meters')::numeric<=804672
    )
  ),
  add constraint workforce_territories_cities_strategy_check check(
    not (strategy_config?'cities') or jsonb_typeof(strategy_config->'cities')='array'
  );

comment on column public.workforce_territories.territory_type is
  'Provider-neutral operating strategy: postal codes, neighborhoods, polygon, radius, city boundaries, delivery zone, service area, or mixed.';
comment on constraint workforce_territories_radius_strategy_check on public.workforce_territories is
  'Radius territories store WGS84 center coordinates and meters; UI distance formatting is presentation-only.';

commit;
