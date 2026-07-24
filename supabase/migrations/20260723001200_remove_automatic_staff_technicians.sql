-- Compatibility cleanup for a development database that applied the earlier
-- automatic staff -> technician migration under version 20260723001100.
drop trigger if exists business_members_create_staff_technician
  on public.business_members;
drop function if exists public.ensure_staff_technician_profile();

comment on table public.technician_profiles is
  'Optional field-service capability attached to a business member. Business role alone never makes a member assignable.';

notify pgrst,'reload schema';
