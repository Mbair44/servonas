begin;

alter table public.business_platform_subscriptions add column if not exists stripe_last_event_created_at timestamptz;
create table if not exists public.stripe_subscription_event_receipts(
 event_id text primary key,event_type text not null,business_id uuid,subscription_id text,event_created_at timestamptz not null,
 processing_state text not null check(processing_state in('processing','applied','failed','ignored')),attempts integer not null default 1,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),applied_at timestamptz
);
alter table public.stripe_subscription_event_receipts enable row level security;
create policy "platform admins read subscription event receipts" on public.stripe_subscription_event_receipts for select to authenticated using(public.is_servonas_platform_admin());
create or replace function public.claim_stripe_subscription_event(p_event_id text,p_event_type text,p_business_id uuid,p_subscription_id text,p_event_created_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.stripe_subscription_event_receipts;
begin
 insert into public.stripe_subscription_event_receipts(event_id,event_type,business_id,subscription_id,event_created_at) values(p_event_id,p_event_type,p_business_id,p_subscription_id,p_event_created_at) on conflict(event_id) do nothing;
 select * into r from public.stripe_subscription_event_receipts where event_id=p_event_id for update;
 if r.processing_state in('applied','ignored') then return false; end if;
 if r.processing_state='processing' and r.updated_at>now()-interval '5 minutes' then return false; end if;
 update public.stripe_subscription_event_receipts set processing_state='processing',attempts=r.attempts+case when r.created_at<>r.updated_at then 1 else 0 end,last_error=null,updated_at=now() where event_id=p_event_id;
 return true;
end $$;
create or replace function public.complete_stripe_subscription_event(p_event_id text,p_state text,p_error text default null)
returns void language sql security definer set search_path=public as $$ update public.stripe_subscription_event_receipts set processing_state=p_state,last_error=p_error,applied_at=case when p_state in('applied','ignored') then now() else null end,updated_at=now() where event_id=p_event_id $$;
revoke all on function public.claim_stripe_subscription_event(text,text,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.complete_stripe_subscription_event(text,text,text) from public,anon,authenticated;
grant execute on function public.claim_stripe_subscription_event(text,text,uuid,text,timestamptz) to service_role;
grant execute on function public.complete_stripe_subscription_event(text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
