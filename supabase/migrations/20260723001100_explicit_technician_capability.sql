-- Business role and field-technician capability are separate concepts.
--
-- This removes the short-lived automatic staff -> technician behavior if it
-- was applied in a development database. Existing technician profiles are
-- intentionally retained because they may already contain real scheduling
-- configuration; owners/admins can disable them from the Team UI.
drop trigger if exists business_members_create_staff_technician
  on public.business_members;
drop function if exists public.ensure_staff_technician_profile();

comment on table public.technician_profiles is
  'Optional field-service capability attached to a business member. Business role alone never makes a member assignable.';

notify pgrst,'reload schema';
