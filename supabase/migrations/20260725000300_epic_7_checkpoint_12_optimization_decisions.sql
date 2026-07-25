begin;

create or replace function public.decide_route_suggestion(
  p_business_id uuid,
  p_suggestion_id uuid,
  p_decision text,
  p_expected_plan_version bigint
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_suggestion public.route_suggestions%rowtype;
  v_current_version bigint;
  v_job_ids uuid[];
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Route management permission required' using errcode='42501';
  end if;
  if p_decision not in ('accepted','dismissed') then
    raise exception 'Decision must be accepted or dismissed' using errcode='22023';
  end if;

  select * into v_suggestion
  from public.route_suggestions
  where id=p_suggestion_id and business_id=p_business_id
  for update;
  if v_suggestion.id is null or v_suggestion.status<>'pending' then
    raise exception 'Pending route suggestion not found' using errcode='P0002';
  end if;

  select version into v_current_version
  from public.route_plans
  where id=v_suggestion.route_plan_id and business_id=p_business_id
  for update;
  if v_current_version<>p_expected_plan_version
    or (v_suggestion.payload->>'planVersion')::bigint<>p_expected_plan_version then
    raise exception 'This route changed while you were editing it. Refresh the route plan before applying your changes.'
      using errcode='40001';
  end if;

  if p_decision='dismissed' then
    update public.route_suggestions
    set status='dismissed',dismissed_at=now(),dismissed_by=auth.uid()
    where id=p_suggestion_id;
    return;
  end if;

  select array_agg(value::uuid order by ordinality) into v_job_ids
  from jsonb_array_elements_text(v_suggestion.payload->'orderedJobIds') with ordinality items(value,ordinality);
  perform public.reorder_technician_route_stops_versioned(
    p_business_id,
    (v_suggestion.payload->>'technicianRouteId')::uuid,
    v_job_ids,
    p_expected_plan_version,
    false
  );
  update public.route_suggestions
  set status='accepted',accepted_at=now(),accepted_by=auth.uid()
  where id=p_suggestion_id;
  update public.route_suggestions
  set status='superseded'
  where business_id=p_business_id and route_plan_id=v_suggestion.route_plan_id
    and status='pending' and id<>p_suggestion_id;
end;
$$;

revoke all on function public.decide_route_suggestion(uuid,uuid,text,bigint) from public;
grant execute on function public.decide_route_suggestion(uuid,uuid,text,bigint)
  to authenticated,service_role;

comment on function public.decide_route_suggestion(uuid,uuid,text,bigint) is
  'Audits acceptance or dismissal and applies an accepted same-technician reorder only when its route-plan version is current.';

commit;
