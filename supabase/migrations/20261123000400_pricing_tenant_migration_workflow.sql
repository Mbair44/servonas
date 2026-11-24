begin;

create table if not exists public.pricing_tenant_migration_audit(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
 idempotency_key uuid not null unique,actor_user_id uuid references auth.users(id) on delete set null,
 action text not null check(action in('previewed','migrated','rolled_back','recovery_required')),
 previous_profile jsonb not null default '{}'::jsonb,next_profile jsonb not null default '{}'::jsonb,
 activation_mode text not null check(activation_mode in('test','production')),reason text,created_at timestamptz not null default now()
);
alter table public.pricing_tenant_migration_audit enable row level security;
create policy "platform admins read pricing migration audit" on public.pricing_tenant_migration_audit for select to authenticated using(public.is_servonas_platform_admin());

create or replace function public.admin_migrate_tenant_pricing(p_business_id uuid,p_target_plan text,p_confirmation text,p_idempotency_key uuid,p_activation_mode text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_profile public.business_pricing_profiles; v_subscription public.business_platform_subscriptions; v_business_name text; v_prior jsonb; v_existing public.pricing_tenant_migration_audit;
begin
 if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501'; end if;
 if p_confirmation<>'MIGRATE' or p_target_plan not in('starter','growth','scale') or p_activation_mode not in('test','production') then raise exception 'Invalid pricing migration confirmation'; end if;
 select * into v_existing from public.pricing_tenant_migration_audit where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('idempotent',true,'action',v_existing.action,'target_plan',v_existing.next_profile->>'plan_key'); end if;
 select name into v_business_name from public.businesses where id=p_business_id and is_deleted=false for update;if not found then raise exception 'Business not found'; end if;
 select * into v_profile from public.business_pricing_profiles where business_id=p_business_id for update;if not found then raise exception 'Pricing profile not found'; end if;
 select * into v_subscription from public.business_platform_subscriptions where business_id=p_business_id;
 if p_target_plan in('growth','scale') and (v_subscription.id is null or v_subscription.status not in('active','trialing') or v_subscription.plan_key<>p_target_plan) then raise exception 'Matching active Stripe subscription is required before a paid migration'; end if;
 v_prior:=jsonb_build_object('plan_key',v_profile.plan_key,'rollout_enabled',v_profile.rollout_enabled,'billing_anchor_at',v_profile.billing_anchor_at,'legacy_pricing_preserved',v_profile.legacy_pricing_preserved);
 update public.business_pricing_profiles set plan_key=p_target_plan,rollout_enabled=true,legacy_pricing_preserved=false,billing_anchor_at=coalesce(billing_anchor_at,now()),migrated_at=now(),migrated_by=auth.uid(),updated_at=now() where business_id=p_business_id;
 insert into public.pricing_tenant_migration_audit(business_id,idempotency_key,actor_user_id,action,previous_profile,next_profile,activation_mode,reason) values(p_business_id,p_idempotency_key,auth.uid(),'migrated',v_prior,jsonb_build_object('plan_key',p_target_plan,'rollout_enabled',true),p_activation_mode,p_reason);
 insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id,metadata) values(p_business_id,v_business_name,'pricing_migrated',auth.uid(),jsonb_build_object('target_plan',p_target_plan,'activation_mode',p_activation_mode,'idempotency_key',p_idempotency_key));
 return jsonb_build_object('idempotent',false,'plan_key',p_target_plan,'rollout_enabled',true);
end $$;
create or replace function public.admin_rollback_tenant_pricing(p_business_id uuid,p_confirmation text,p_idempotency_key uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_profile public.business_pricing_profiles; v_business_name text; v_cycles integer; v_prior jsonb;
begin
 if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501'; end if;
 if p_confirmation<>'ROLLBACK' then raise exception 'Invalid rollback confirmation'; end if;
 select name into v_business_name from public.businesses where id=p_business_id and is_deleted=false for update;if not found then raise exception 'Business not found'; end if;
 select * into v_profile from public.business_pricing_profiles where business_id=p_business_id for update;if not found then raise exception 'Pricing profile not found'; end if;
 select count(*) into v_cycles from public.platform_fee_cycles where business_id=p_business_id and (captured_cents>0 or reserved_cents>0);
 if v_cycles>0 then insert into public.pricing_tenant_migration_audit(business_id,idempotency_key,actor_user_id,action,previous_profile,next_profile,activation_mode,reason) values(p_business_id,p_idempotency_key,auth.uid(),'recovery_required',jsonb_build_object('plan_key',v_profile.plan_key),jsonb_build_object('plan_key','legacy'),'production',coalesce(p_reason,'Fee activity requires compensating recovery')); raise exception 'Pricing rollback requires fee recovery review'; end if;
 v_prior:=jsonb_build_object('plan_key',v_profile.plan_key,'rollout_enabled',v_profile.rollout_enabled);
 update public.business_pricing_profiles set plan_key='legacy',rollout_enabled=false,legacy_pricing_preserved=true,migrated_at=null,migrated_by=null,updated_at=now() where business_id=p_business_id;
 insert into public.pricing_tenant_migration_audit(business_id,idempotency_key,actor_user_id,action,previous_profile,next_profile,activation_mode,reason) values(p_business_id,p_idempotency_key,auth.uid(),'rolled_back',v_prior,jsonb_build_object('plan_key','legacy','rollout_enabled',false),'production',p_reason);
 insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id,metadata) values(p_business_id,v_business_name,'pricing_migration_rolled_back',auth.uid(),jsonb_build_object('idempotency_key',p_idempotency_key));
 return jsonb_build_object('plan_key','legacy','rollout_enabled',false);
end $$;
revoke all on function public.admin_migrate_tenant_pricing(uuid,text,text,uuid,text,text) from public;
revoke all on function public.admin_rollback_tenant_pricing(uuid,text,uuid,text) from public;
grant execute on function public.admin_migrate_tenant_pricing(uuid,text,text,uuid,text,text) to authenticated;
grant execute on function public.admin_rollback_tenant_pricing(uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
