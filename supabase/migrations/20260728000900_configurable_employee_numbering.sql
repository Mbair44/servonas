begin;

create table if not exists public.employee_numbering_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 auto_assign_enabled boolean not null default true,
 prefix text not null default '',
 starting_number bigint not null default 1001 check(starting_number>0),
 next_number bigint not null default 1001 check(next_number>0),
 minimum_digits smallint not null default 4 check(minimum_digits between 1 and 10),
 allow_manual_override boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 constraint employee_numbering_prefix_check check(length(prefix)<=10 and prefix~'^[A-Za-z0-9_-]*$')
);

create table if not exists public.employee_numbering_audit_events(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid references auth.users(id),
 previous_value jsonb,
 new_value jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists employee_numbering_audit_business_created_idx on public.employee_numbering_audit_events(business_id,created_at desc);

insert into public.employee_numbering_settings(business_id,next_number)
select b.id,greatest(1001,coalesce((
 select max(e.employee_number::bigint)+1 from public.employees e
 where e.business_id=b.id and btrim(e.employee_number)~'^[0-9]+$' and length(btrim(e.employee_number))<=18
),1001))
from public.businesses b
on conflict(business_id)do nothing;

create or replace function public.initialize_employee_numbering()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.employee_numbering_settings(business_id)values(new.id)on conflict do nothing;
 return new;
end$$;
drop trigger if exists businesses_initialize_employee_numbering on public.businesses;
create trigger businesses_initialize_employee_numbering after insert on public.businesses
for each row execute function public.initialize_employee_numbering();

create or replace function public.assign_employee_number()
returns trigger language plpgsql security definer set search_path=public as $$
declare s public.employee_numbering_settings%rowtype;v_number text;v_sequence bigint;
begin
 if tg_op='UPDATE' and new.employee_number is not distinct from old.employee_number then return new;end if;
 insert into public.employee_numbering_settings(business_id)values(new.business_id)on conflict do nothing;
 select * into s from public.employee_numbering_settings where business_id=new.business_id for update;
 if nullif(btrim(coalesce(new.employee_number,'')),'') is not null then
  if not s.allow_manual_override then raise exception 'Manual employee numbers are disabled' using errcode='22023';end if;
  new.employee_number:=btrim(new.employee_number);
  if length(new.employee_number)>64 or new.employee_number!~'^[A-Za-z0-9_-]+$' then
   raise exception 'Employee number may contain letters, numbers, hyphens, and underscores and must be 64 characters or fewer' using errcode='22023';
  end if;
  return new;
 end if;
 if tg_op='UPDATE' then new.employee_number:=null;return new;end if;
 if not s.auto_assign_enabled then new.employee_number:=null;return new;end if;
 v_sequence:=s.next_number;
 loop
  v_number:=s.prefix||lpad(v_sequence::text,s.minimum_digits,'0');
  exit when not exists(select 1 from public.employees e where e.business_id=new.business_id and lower(e.employee_number)=lower(v_number));
  v_sequence:=v_sequence+1;
 end loop;
 new.employee_number:=v_number;
 update public.employee_numbering_settings set next_number=v_sequence+1,updated_at=now() where business_id=new.business_id;
 return new;
end$$;
drop trigger if exists employees_assign_employee_number on public.employees;
create trigger employees_assign_employee_number before insert or update of employee_number on public.employees
for each row execute function public.assign_employee_number();

create or replace function public.update_employee_numbering_settings(
 p_business_id uuid,p_auto_assign_enabled boolean,p_prefix text,p_starting_number bigint,
 p_next_number bigint,p_minimum_digits smallint,p_allow_manual_override boolean
)returns public.employee_numbering_settings language plpgsql security definer set search_path=public as $$
declare old_value public.employee_numbering_settings%rowtype;new_value public.employee_numbering_settings%rowtype;v_prefix text;v_preview text;
begin
 if not public.has_business_role(p_business_id,array['owner','admin']) and not public.is_servonas_platform_admin() then raise exception 'Permission denied' using errcode='42501';end if;
 v_prefix:=btrim(coalesce(p_prefix,''));
 if p_starting_number<1 or p_next_number<1 then raise exception 'Starting and next numbers must be positive integers' using errcode='22023';end if;
 if p_minimum_digits not between 1 and 10 then raise exception 'Minimum digits must be between 1 and 10' using errcode='22023';end if;
 if length(v_prefix)>10 or v_prefix!~'^[A-Za-z0-9_-]*$' then raise exception 'Prefix may use up to 10 letters, numbers, hyphens, or underscores' using errcode='22023';end if;
 insert into public.employee_numbering_settings(business_id)values(p_business_id)on conflict do nothing;
 select * into old_value from public.employee_numbering_settings where business_id=p_business_id for update;
 v_preview:=v_prefix||lpad(p_next_number::text,p_minimum_digits,'0');
 if exists(select 1 from public.employees where business_id=p_business_id and lower(employee_number)=lower(v_preview)) then
  raise exception 'The next formatted employee number already exists' using errcode='23505';
 end if;
 update public.employee_numbering_settings set auto_assign_enabled=p_auto_assign_enabled,prefix=v_prefix,
  starting_number=p_starting_number,next_number=p_next_number,minimum_digits=p_minimum_digits,
  allow_manual_override=p_allow_manual_override,updated_at=now(),updated_by=auth.uid()
 where business_id=p_business_id returning * into new_value;
 insert into public.employee_numbering_audit_events(business_id,actor_user_id,previous_value,new_value)
 values(p_business_id,auth.uid(),to_jsonb(old_value)-'created_at'-'updated_at',to_jsonb(new_value)-'created_at'-'updated_at');
 return new_value;
end$$;

alter table public.employee_numbering_settings enable row level security;
alter table public.employee_numbering_audit_events enable row level security;
drop policy if exists "members read employee numbering" on public.employee_numbering_settings;
create policy "members read employee numbering" on public.employee_numbering_settings for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "admins read employee numbering audit" on public.employee_numbering_audit_events;
create policy "admins read employee numbering audit" on public.employee_numbering_audit_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
revoke all on function public.update_employee_numbering_settings(uuid,boolean,text,bigint,bigint,smallint,boolean) from public;
grant execute on function public.update_employee_numbering_settings(uuid,boolean,text,bigint,bigint,smallint,boolean) to authenticated;

comment on table public.employee_numbering_settings is 'Tenant-scoped configuration for human-readable employee identifiers.';
comment on function public.assign_employee_number() is 'Authoritative concurrency-safe employee number allocator. Employee UUIDs remain primary identifiers.';
commit;
