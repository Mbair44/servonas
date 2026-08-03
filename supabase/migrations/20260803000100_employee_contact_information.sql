-- Structured private contact information for employee records.
begin;

alter table public.employees
  add column if not exists secondary_phone text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'US',
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text;

comment on column public.employees.address_line_1 is
  'Private employee home mailing address; protected by employee tenant RLS.';
comment on column public.employees.emergency_contact_phone is
  'Private emergency contact phone; protected by employee tenant RLS.';

alter table public.employees
  add constraint employees_contact_lengths_check check (
    length(coalesce(secondary_phone,'')) <= 50
    and length(coalesce(address_line_1,'')) <= 200
    and length(coalesce(address_line_2,'')) <= 200
    and length(coalesce(city,'')) <= 120
    and length(coalesce(state,'')) <= 100
    and length(coalesce(postal_code,'')) <= 30
    and length(coalesce(country,'')) <= 2
    and length(coalesce(emergency_contact_name,'')) <= 200
    and length(coalesce(emergency_contact_phone,'')) <= 50
    and length(coalesce(emergency_contact_relationship,'')) <= 100
  );

notify pgrst, 'reload schema';
commit;
