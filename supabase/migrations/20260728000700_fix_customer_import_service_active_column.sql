-- Repair Epic 2.3 customer imports on databases where services use the
-- canonical `active` flag from the public-booking service model. Do not add an
-- independently writable `is_active` alias.
do $$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.commit_customer_import(uuid,integer,boolean)'::regprocedure)
    into v_definition;
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    'and is_active=true limit 1',
    'and active=true and is_deleted=false limit 1'
  );

  if v_definition = v_original then
    if position('and active=true and is_deleted=false limit 1' in v_definition) > 0 then
      raise notice 'commit_customer_import already uses services.active';
      return;
    end if;
    raise exception
      'Could not find the legacy services.is_active predicate in commit_customer_import()';
  end if;

  execute v_definition;
end
$$;

comment on function public.commit_customer_import(uuid,integer,boolean) is
  'Commits reviewed customer imports idempotently using services.active as the authoritative service availability flag.';
