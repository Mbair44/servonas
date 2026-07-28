-- Epic 2.4 Checkpoints 1-6: entitlement lifecycle, concurrency, pilot helper, and safe backfill.
alter table public.business_entitlements drop constraint if exists business_entitlements_status_check;
alter table public.business_entitlements drop constraint if exists business_entitlements_source_check;
alter table public.business_entitlements drop constraint if exists business_entitlements_business_id_entitlement_key_key;
update public.business_entitlements set status='suspended',metadata=metadata||jsonb_build_object('legacy_status','inactive') where status='inactive';
update public.business_entitlements set source='billing_sync' where source='subscription';
alter table public.business_entitlements
 add column if not exists grace_period_ends_at timestamptz,
 add column if not exists suspended_at timestamptz,
 add column if not exists suspended_by uuid references auth.users(id),
 add column if not exists suspension_reason text,
 add column if not exists canceled_at timestamptz,
 add column if not exists canceled_by uuid references auth.users(id),
 add column if not exists cancellation_reason text,
 add column if not exists version integer not null default 1,
 add column if not exists superseded_by_entitlement_id uuid references public.business_entitlements(id);
alter table public.business_entitlements add constraint business_entitlements_code_check check(entitlement_key in('pilot','starter','growth','business','enterprise')) not valid;
alter table public.business_entitlements add constraint business_entitlements_status_check check(status in('scheduled','active','grace_period','expired','suspended','canceled','superseded'));
alter table public.business_entitlements add constraint business_entitlements_source_check check(source in('pilot','manual','billing_sync','migration','system'));
alter table public.business_entitlements add constraint business_entitlements_dates_check check((ends_at is null or ends_at>starts_at)and(grace_period_ends_at is null or(ends_at is not null and grace_period_ends_at>ends_at)));
alter table public.business_entitlements add constraint business_entitlements_version_check check(version>0);
create unique index business_entitlements_one_primary_idx on public.business_entitlements(business_id) where status in('scheduled','active','grace_period');
create index business_entitlements_effective_idx on public.business_entitlements(business_id,starts_at desc,ends_at,status);

create or replace function public.ensure_pilot_entitlement(p_business_id uuid,p_actor_user_id uuid default auth.uid(),p_source text default 'system')
returns public.business_entitlements language plpgsql security definer set search_path=public as $$
declare v public.business_entitlements;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,24));
 select * into v from public.business_entitlements where business_id=p_business_id and status in('scheduled','active','grace_period') order by starts_at desc limit 1;
 if v.id is not null then return v;end if;
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by)
 values(p_business_id,'pilot','active',case when p_source in('pilot','manual','billing_sync','migration','system') then p_source else 'system' end,jsonb_build_object('provisioned_by',p_source),p_actor_user_id,p_actor_user_id)returning * into v;
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata)
 values(p_business_id,v.id,'pilot_entitlement_granted',p_actor_user_id,'pilot','active',jsonb_build_object('source',p_source));
 return v;
end$$;
revoke all on function public.ensure_pilot_entitlement(uuid,uuid,text) from public;grant execute on function public.ensure_pilot_entitlement(uuid,uuid,text) to service_role;

insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata)
select b.id,'pilot','active','migration',jsonb_build_object('epic_2_4_backfill',true)
from public.businesses b where not exists(select 1 from public.business_entitlements e where e.business_id=b.id);
insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,entitlement_key,status,metadata)
select e.business_id,e.id,'existing_tenant_backfilled',e.entitlement_key,e.status,jsonb_build_object('epic','2.4')
from public.business_entitlements e where e.metadata->>'epic_2_4_backfill'='true'
and not exists(select 1 from public.business_entitlement_audit_events a where a.entitlement_id=e.id and a.event_type='existing_tenant_backfilled');
