-- A technician profile is an independent capability and must never reduce a
-- member's workspace role. Repair canonical owners and prevent an invitation
-- from demoting any existing membership.

update public.business_members as member
set role='owner'
from public.businesses as business
where business.id=member.business_id
  and business.owner_user_id=member.user_id
  and member.role<>'owner';

insert into public.business_members(business_id,user_id,role)
select business.id,business.owner_user_id,'owner'
from public.businesses as business
where business.owner_user_id is not null
on conflict on constraint business_members_pkey
do update set role='owner';

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

  insert into public.business_members as member(business_id,user_id,role)
  values (v_inv.business_id,v_user,v_inv.role)
  on conflict on constraint business_members_pkey
  do update set role=case
    when member.role='owner' then 'owner'
    when member.role='admin' and excluded.role in ('manager','staff') then 'admin'
    when member.role='manager' and excluded.role='staff' then 'manager'
    else excluded.role
  end;

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

notify pgrst,'reload schema';
