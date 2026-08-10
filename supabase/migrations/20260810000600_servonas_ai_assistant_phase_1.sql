begin;

create table public.ai_conversations(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 title text,
 channel text not null default 'web' check(channel in('web','mobile','voice','phone_call','sms')),
 context jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.ai_messages(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in('user','assistant','tool','system')),content text not null,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create table public.ai_action_requests(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
 action_type text not null,action_payload jsonb not null default '{}'::jsonb,risk_level text not null check(risk_level in('low','medium','high')),
 status text not null check(status in('pending','awaiting_confirmation','approved','executing','completed','rejected','failed')),
 requires_confirmation boolean not null default false,idempotency_key text not null,confirmed_at timestamptz,executed_at timestamptz,
 execution_result jsonb,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,idempotency_key)
);
create table public.ai_action_audit_log(
 id bigint generated always as identity primary key,business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,conversation_id uuid references public.ai_conversations(id) on delete set null,
 action_request_id uuid references public.ai_action_requests(id) on delete set null,action_type text not null,
 affected_entity_type text,affected_entity_id uuid,before_state jsonb,after_state jsonb,source text not null default 'web',created_at timestamptz not null default now()
);
create index ai_conversations_user_timeline on public.ai_conversations(business_id,user_id,updated_at desc);
create index ai_messages_conversation_timeline on public.ai_messages(conversation_id,created_at);
create index ai_actions_pending on public.ai_action_requests(business_id,user_id,status,created_at desc);
create index ai_audit_timeline on public.ai_action_audit_log(business_id,created_at desc);

create or replace function public.record_ai_action_audit(
 p_business_id uuid,p_conversation_id uuid,p_action_request_id uuid,p_action_type text,
 p_entity_type text,p_entity_id uuid,p_before jsonb,p_after jsonb,p_source text
) returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin','manager','staff']) then raise exception 'AI audit permission denied' using errcode='42501';end if;
 insert into public.ai_action_audit_log(business_id,user_id,conversation_id,action_request_id,action_type,affected_entity_type,affected_entity_id,before_state,after_state,source)
 values(p_business_id,auth.uid(),p_conversation_id,p_action_request_id,p_action_type,nullif(p_entity_type,''),p_entity_id,p_before,p_after,coalesce(nullif(p_source,''),'web')) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.record_ai_action_audit(uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,text) from public;
grant execute on function public.record_ai_action_audit(uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,text) to authenticated;

alter table public.ai_conversations enable row level security;alter table public.ai_messages enable row level security;
alter table public.ai_action_requests enable row level security;alter table public.ai_action_audit_log enable row level security;
create policy "users manage own AI conversations" on public.ai_conversations for all to authenticated using(user_id=auth.uid() and public.has_business_role(business_id,array['owner','admin','manager','staff'])) with check(user_id=auth.uid() and public.has_business_role(business_id,array['owner','admin','manager','staff']));
create policy "users manage own AI messages" on public.ai_messages for all to authenticated using(user_id=auth.uid() and public.has_business_role(business_id,array['owner','admin','manager','staff'])) with check(user_id=auth.uid() and public.has_business_role(business_id,array['owner','admin','manager','staff']));
create policy "users manage own AI actions" on public.ai_action_requests for all to authenticated using(user_id=auth.uid() and public.has_business_role(business_id,array['owner','admin','manager','staff'])) with check(user_id=auth.uid() and public.has_business_role(business_id,array['owner','admin','manager','staff']));
create policy "users read own AI audit" on public.ai_action_audit_log for select to authenticated using(user_id=auth.uid() and public.has_business_role(business_id,array['owner','admin','manager','staff']));
revoke insert,update,delete on public.ai_action_audit_log from anon,authenticated;
notify pgrst,'reload schema';commit;
