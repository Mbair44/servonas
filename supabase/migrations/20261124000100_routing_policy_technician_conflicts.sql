begin;

alter table public.business_routing_policies
  add column if not exists enforce_technician_schedule_conflicts boolean not null default true;

comment on column public.business_routing_policies.enforce_technician_schedule_conflicts is
  'When enabled, prevent assigning a technician to overlapping job windows. When disabled, overlapping assignments remain visible as routing warnings but are allowed.';

commit;
