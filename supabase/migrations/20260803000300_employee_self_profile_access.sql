-- Let a signed-in employee read their own tenant-scoped employee record.
begin;

drop policy if exists "employees read own profile" on public.employees;
create policy "employees read own profile"
on public.employees
for select
to authenticated
using (auth_user_id=auth.uid());

commit;
