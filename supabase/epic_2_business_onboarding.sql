-- Servonas Epic 2: atomic business onboarding and secure team invitations.
create extension if not exists "pgcrypto";

alter table public.businesses
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists timezone text not null default 'America/Phoenix';

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('admin','manager','staff')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (business_id, email)
);
create index if not exists business_invitations_business_idx on public.business_invitations(business_id);
create index if not exists business_invitations_token_idx on public.business_invitations(token);

create or replace function public.create_business_workspace(
  p_name text,
  p_slug text,
  p_email text,
  p_business_model text,
  p_primary_color text,
  p_enabled_modules jsonb
) returns public.businesses
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_business public.businesses;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Business name is required'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid workspace slug'; end if;
  if p_business_model not in ('rentals','services','appointments','hybrid') then raise exception 'Invalid business model'; end if;

  insert into public.businesses(name,slug,owner_user_id,business_model,email,primary_color,enabled_modules,onboarding_completed_at)
  values(trim(p_name),lower(trim(p_slug)),v_user,p_business_model,nullif(trim(p_email),''),coalesce(nullif(p_primary_color,''),'#2563eb'),coalesce(p_enabled_modules,'[]'::jsonb),now())
  returning * into v_business;

  insert into public.business_members(business_id,user_id,role)
  values(v_business.id,v_user,'owner')
  on conflict(business_id,user_id) do update set role='owner';

  return v_business;
end; $$;
grant execute on function public.create_business_workspace(text,text,text,text,text,jsonb) to authenticated;

create or replace function public.accept_business_invitation(p_token uuid)
returns table(business_id uuid, business_slug text)
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.business_invitations;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_inv from public.business_invitations
    where token=p_token and accepted_at is null and expires_at > now()
    for update;
  if v_inv.id is null then raise exception 'Invitation is invalid or expired'; end if;
  if lower(v_inv.email) <> v_email then raise exception 'Sign in with the invited email address'; end if;

  insert into public.business_members(business_id,user_id,role)
  values(v_inv.business_id,v_user,v_inv.role)
  on conflict(business_id,user_id) do update set role=excluded.role;

  update public.business_invitations set accepted_by=v_user,accepted_at=now() where id=v_inv.id;
  return query select b.id,b.slug from public.businesses b where b.id=v_inv.business_id;
end; $$;
grant execute on function public.accept_business_invitation(uuid) to authenticated;

alter table public.business_invitations enable row level security;
drop policy if exists "business admins can view invitations" on public.business_invitations;
create policy "business admins can view invitations" on public.business_invitations for select using (
  exists(select 1 from public.business_members m where m.business_id=business_invitations.business_id and m.user_id=auth.uid() and m.role in ('owner','admin'))
  or lower(email)=(select lower(u.email) from auth.users u where u.id=auth.uid())
);
drop policy if exists "business admins can create invitations" on public.business_invitations;
create policy "business admins can create invitations" on public.business_invitations for insert with check (
  invited_by=auth.uid() and exists(select 1 from public.business_members m where m.business_id=business_invitations.business_id and m.user_id=auth.uid() and m.role in ('owner','admin'))
);
drop policy if exists "business admins can delete invitations" on public.business_invitations;
create policy "business admins can delete invitations" on public.business_invitations for delete using (
  exists(select 1 from public.business_members m where m.business_id=business_invitations.business_id and m.user_id=auth.uid() and m.role in ('owner','admin'))
);
