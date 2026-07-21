-- Servonas Epic 3: customers, business settings, dashboard activity and audit fields.
create extension if not exists "pgcrypto";

alter table public.businesses
  add column if not exists website_url text,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists is_deleted boolean not null default false;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  is_deleted boolean not null default false
);
create index if not exists customers_business_id_idx on public.customers(business_id);
create index if not exists customers_business_search_idx on public.customers(business_id,lower(last_name),lower(first_name));

create table if not exists public.business_activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists business_activity_business_created_idx on public.business_activity(business_id,created_at desc);

create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role=any(p_roles));
$$;
revoke all on function public.has_business_role(uuid,text[]) from public;
grant execute on function public.has_business_role(uuid,text[]) to authenticated;

alter table public.customers enable row level security;
alter table public.business_activity enable row level security;

drop policy if exists "members can view customers" on public.customers;
create policy "members can view customers" on public.customers for select using (public.is_business_member(business_id));
drop policy if exists "managers can create customers" on public.customers;
create policy "managers can create customers" on public.customers for insert with check (public.has_business_role(business_id,array['owner','admin','manager']) and created_by=auth.uid());
drop policy if exists "managers can update customers" on public.customers;
create policy "managers can update customers" on public.customers for update using (public.has_business_role(business_id,array['owner','admin','manager'])) with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view activity" on public.business_activity;
create policy "members can view activity" on public.business_activity for select using (public.is_business_member(business_id));

-- Owners and admins may update business configuration.
drop policy if exists "owners can update businesses" on public.businesses;
drop policy if exists "owners and admins can update businesses" on public.businesses;
create policy "owners and admins can update businesses" on public.businesses for update using (public.has_business_role(id,array['owner','admin'])) with check (public.has_business_role(id,array['owner','admin']));

create or replace function public.log_epic3_activity() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='customers' then
    insert into public.business_activity(business_id,actor_user_id,action,entity_type,entity_id,summary)
    values(new.business_id,auth.uid(),lower(tg_op),'customer',new.id,
      case when tg_op='INSERT' then 'Customer added: '||trim(new.first_name||' '||new.last_name)
           when new.is_deleted and not old.is_deleted then 'Customer archived: '||trim(new.first_name||' '||new.last_name)
           else 'Customer updated: '||trim(new.first_name||' '||new.last_name) end);
  end if;
  return new;
end; $$;
drop trigger if exists customers_activity_trigger on public.customers;
create trigger customers_activity_trigger after insert or update on public.customers for each row execute function public.log_epic3_activity();

create or replace function public.log_business_settings_activity() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.name,new.email,new.phone,new.website_url,new.timezone,new.primary_color,new.address_line1,new.city,new.state,new.postal_code,new.tax_rate)
     is distinct from row(old.name,old.email,old.phone,old.website_url,old.timezone,old.primary_color,old.address_line1,old.city,old.state,old.postal_code,old.tax_rate) then
    insert into public.business_activity(business_id,actor_user_id,action,entity_type,entity_id,summary)
    values(new.id,auth.uid(),'update','business',new.id,'Business settings updated');
  end if;
  return new;
end; $$;
drop trigger if exists business_settings_activity_trigger on public.businesses;
create trigger business_settings_activity_trigger after update on public.businesses for each row execute function public.log_business_settings_activity();

-- Email uniqueness is tenant-scoped and case-insensitive.
alter table public.customers drop constraint if exists customers_email_unique;
drop index if exists public.customers_email_unique;
create unique index if not exists customers_business_email_unique
  on public.customers (business_id, lower(email))
  where email is not null and btrim(email) <> '' and is_deleted = false;
