-- Servonas Epic 2 workspace access fix
-- Removes recursive RLS checks from businesses/business_members policies.

create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = p_business_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_business_admin(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = p_business_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.is_business_admin(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_business_admin(uuid) to authenticated;

drop policy if exists "members can view businesses" on public.businesses;
create policy "members can view businesses"
on public.businesses
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_business_member(id)
);

drop policy if exists "members can view membership" on public.business_members;
create policy "members can view membership"
on public.business_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_business_admin(business_id)
);

drop policy if exists "business admins can view invitations" on public.business_invitations;
create policy "business admins can view invitations"
on public.business_invitations
for select
to authenticated
using (
  public.is_business_admin(business_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "business admins can create invitations" on public.business_invitations;
create policy "business admins can create invitations"
on public.business_invitations
for insert
to authenticated
with check (
  invited_by = auth.uid()
  and public.is_business_admin(business_id)
);

drop policy if exists "business admins can delete invitations" on public.business_invitations;
create policy "business admins can delete invitations"
on public.business_invitations
for delete
to authenticated
using (public.is_business_admin(business_id));
