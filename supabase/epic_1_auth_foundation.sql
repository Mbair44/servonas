-- Servonas Epic 1: authentication, profiles, memberships, and secure tenant access.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do update set email=excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles(id,email)
select id,email from auth.users on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile" on public.profiles for select using(id=auth.uid());
drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());

drop policy if exists "members can view businesses" on public.businesses;
create policy "members can view businesses" on public.businesses for select using(
  owner_user_id=auth.uid() or exists(select 1 from public.business_members m where m.business_id=businesses.id and m.user_id=auth.uid())
);
drop policy if exists "authenticated users can create businesses" on public.businesses;
create policy "authenticated users can create businesses" on public.businesses for insert to authenticated with check(owner_user_id=auth.uid());
drop policy if exists "owners can update businesses" on public.businesses;
create policy "owners can update businesses" on public.businesses for update using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid());

drop policy if exists "members can view membership" on public.business_members;
create policy "members can view membership" on public.business_members for select using(
  user_id=auth.uid() or exists(select 1 from public.business_members mine where mine.business_id=business_members.business_id and mine.user_id=auth.uid() and mine.role in ('owner','admin'))
);
drop policy if exists "owners can add memberships" on public.business_members;
create policy "owners can add memberships" on public.business_members for insert with check(
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid())
);
drop policy if exists "owners can manage memberships" on public.business_members;
create policy "owners can manage memberships" on public.business_members for update using(
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid())
);
drop policy if exists "owners can remove memberships" on public.business_members;
create policy "owners can remove memberships" on public.business_members for delete using(
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid())
);
