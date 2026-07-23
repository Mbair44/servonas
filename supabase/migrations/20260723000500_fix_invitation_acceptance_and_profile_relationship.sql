-- Fix invitation acceptance and expose the explicit membership -> profile
-- relationship required by PostgREST embedding.

create or replace function public.accept_business_invitation(p_token uuid)
returns table(business_id uuid, business_slug text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.business_invitations;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select lower(u.email)
  into v_email
  from auth.users as u
  where u.id=v_user;

  select inv.*
  into v_inv
  from public.business_invitations as inv
  where inv.token=p_token
    and inv.accepted_at is null
    and inv.expires_at>now()
  for update;

  if v_inv.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;
  if lower(v_inv.email)<>v_email then
    raise exception 'Sign in with the invited email address';
  end if;

  -- The named constraint avoids ambiguity with this function's business_id
  -- output parameter. Only the business carried by the locked invitation can
  -- be added to the caller's memberships.
  insert into public.business_members as member(
    business_id,
    user_id,
    role
  ) values (
    v_inv.business_id,
    v_user,
    v_inv.role
  )
  on conflict on constraint business_members_pkey
  do update set role=excluded.role;

  update public.business_invitations as inv
  set accepted_by=v_user,
      accepted_at=now()
  where inv.id=v_inv.id
    and inv.business_id=v_inv.business_id;

  return query
  select business.id,business.slug
  from public.businesses as business
  where business.id=v_inv.business_id;
end;
$$;

revoke all on function public.accept_business_invitation(uuid) from public;
grant execute on function public.accept_business_invitation(uuid) to authenticated;

-- Historical audit: every membership user must already have the profile
-- created by handle_new_user before the direct relationship can be validated.
do $$
begin
  if exists (
    select 1
    from public.business_members as member
    left join public.profiles as profile on profile.id=member.user_id
    where profile.id is null
  ) then
    raise exception 'Cannot add business_members_user_profile_fk: membership rows without profiles exist';
  end if;
end;
$$;

alter table public.business_members
  drop constraint if exists business_members_user_profile_fk;
alter table public.business_members
  add constraint business_members_user_profile_fk
  foreign key(user_id)
  references public.profiles(id)
  on delete cascade
  not valid;
alter table public.business_members
  validate constraint business_members_user_profile_fk;

-- Owners/admins may read the basic profiles of members in businesses they
-- administer. This does not expose profiles from unrelated businesses.
drop policy if exists "business admins can view member profiles" on public.profiles;
create policy "business admins can view member profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.business_members as member
    where member.user_id=profiles.id
      and public.is_business_admin(member.business_id)
  )
);

notify pgrst,'reload schema';
