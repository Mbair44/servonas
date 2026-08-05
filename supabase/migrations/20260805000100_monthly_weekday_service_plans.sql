-- Allow recurring service plans such as "the first Wednesday of every month".
-- Existing month plans continue to repeat by calendar day of month.
begin;

alter table public.recurring_service_series
  drop constraint if exists recurring_service_cadence_check;
alter table public.recurring_service_series
  add constraint recurring_service_cadence_check
  check(cadence_unit in ('day','week','month','month_weekday','year'));

create or replace function public.service_plan_occurrence_date(p_anchor date,p_value integer,p_unit text,p_index integer)
returns date language plpgsql immutable as $$
declare
 v_result date;v_months integer;v_anchor_last boolean;v_ordinal integer;v_weekday integer;v_first_weekday integer;v_day integer;
begin
 if p_value<1 or p_index<0 or p_unit not in('day','week','month','month_weekday','year') then raise exception 'Invalid recurrence' using errcode='22023';end if;
 if p_unit='day' then return p_anchor+(p_value*p_index);end if;
 if p_unit='week' then return p_anchor+(p_value*p_index*7);end if;
 v_months:=p_value*p_index*(case when p_unit='year' then 12 else 1 end);
 v_result=(date_trunc('month',p_anchor)+(v_months||' months')::interval)::date;
 if p_unit='month_weekday' then
  v_ordinal=ceil(extract(day from p_anchor)/7.0)::integer;
  v_weekday=extract(dow from p_anchor)::integer;
  v_first_weekday=extract(dow from v_result)::integer;
  v_day=1+mod(v_weekday-v_first_weekday+7,7)+(v_ordinal-1)*7;
  return v_result+(v_day-1);
 end if;
 v_anchor_last=p_anchor=(date_trunc('month',p_anchor)+interval '1 month - 1 day')::date;
 return v_result+case when v_anchor_last then extract(day from (v_result+interval '1 month - 1 day'))::integer-1 else least(extract(day from p_anchor)::integer,extract(day from (v_result+interval '1 month - 1 day'))::integer)-1 end;
end$$;

notify pgrst, 'reload schema';
commit;
