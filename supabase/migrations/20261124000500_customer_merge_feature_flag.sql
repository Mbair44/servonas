-- Customer merge is deliberately disabled unless a platform-controlled row is
-- added for a tenant after staging certification. The authorization assertion
-- is shared by preview and confirm, so direct RPC calls fail closed as well.
begin;

create table if not exists public.business_customer_merge_features (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 enabled_at timestamptz,
 enabled_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.business_customer_merge_features enable row level security;

create or replace function public.customer_merge_feature_enabled(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select enabled from public.business_customer_merge_features where business_id=p_business_id),false)
$$;
revoke all on function public.customer_merge_feature_enabled(uuid) from public;
grant execute on function public.customer_merge_feature_enabled(uuid) to authenticated;

create or replace function public.customer_merge_assert_authorized_pair(p_primary_customer_id uuid,p_duplicate_customer_id uuid)
returns table(business_id uuid,primary_customer public.customers,duplicate_customer public.customers)
language plpgsql security definer set search_path=public as $$
declare p public.customers%rowtype;d public.customers%rowtype;
begin
 select * into p from public.customers where id=p_primary_customer_id;
 select * into d from public.customers where id=p_duplicate_customer_id;
 if p.id is null or d.id is null or p.business_id<>d.business_id then raise exception 'CUSTOMER_MERGE_NOT_FOUND' using errcode='P0002'; end if;
 if not public.has_business_role(p.business_id,array['owner','admin']) then raise exception 'CUSTOMER_MERGE_FORBIDDEN' using errcode='42501'; end if;
 if not public.customer_merge_feature_enabled(p.business_id) then raise exception 'CUSTOMER_MERGE_FEATURE_DISABLED' using errcode='55000'; end if;
 if p.id=d.id then raise exception 'CUSTOMER_MERGE_SELF' using errcode='22023'; end if;
 if p.merged_into_customer_id is not null or p.is_deleted or not p.is_active then raise exception 'CUSTOMER_MERGE_PRIMARY_INACTIVE' using errcode='55000'; end if;
 if d.merged_into_customer_id is not null or d.is_deleted or not d.is_active then raise exception 'CUSTOMER_MERGE_DUPLICATE_ALREADY_MERGED' using errcode='55000'; end if;
 return query select p.business_id,p,d;
end $$;
revoke all on function public.customer_merge_assert_authorized_pair(uuid,uuid) from public;

notify pgrst,'reload schema';
commit;
