-- Repair already-deployed Epic 2.3 import functions that read `is_active`.
-- `active` remains authoritative: this compatibility field is generated and
-- therefore cannot be written independently or drift from the service record.
alter table public.services
  add column if not exists is_active boolean
  generated always as (active) stored;

comment on column public.services.is_active is
  'Read-only compatibility alias generated from services.active.';
