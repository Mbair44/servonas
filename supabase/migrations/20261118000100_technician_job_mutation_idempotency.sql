-- Durable, actor-scoped idempotency for technician-only job mutations.
-- Retain committed rows for at least the maximum mobile/web retry window; do not
-- delete them automatically, because expiry would permit a duplicate mutation.
begin;

create table if not exists public.job_mutation_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('technician_status_transition','technician_note')),
  request_id uuid not null,
  request_fingerprint text not null,
  outcome jsonb not null,
  committed_at timestamptz not null default now(),
  constraint job_mutation_requests_job_tenant_fk foreign key (business_id,job_id) references public.jobs(business_id,id) on delete cascade,
  constraint job_mutation_requests_identity_unique unique (actor_user_id,business_id,job_id,operation,request_id)
);
create index if not exists job_mutation_requests_retention_idx on public.job_mutation_requests(committed_at);
alter table public.job_mutation_requests enable row level security;
-- No user-facing policies: only SECURITY DEFINER functions write/read outcomes.
revoke all on public.job_mutation_requests from anon,authenticated;

create or replace function public.is_active_assigned_job_technician(p_business_id uuid,p_job_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.job_assignments a join public.technician_profiles t
   on t.id=a.technician_id and t.business_id=a.business_id
  where a.business_id=p_business_id and a.job_id=p_job_id and a.is_active
    and t.member_user_id=auth.uid() and t.is_active and t.is_technician and t.can_be_assigned_jobs);
$$;
revoke all on function public.is_active_assigned_job_technician(uuid,uuid) from public;
grant execute on function public.is_active_assigned_job_technician(uuid,uuid) to authenticated,service_role;

create or replace function public.is_active_primary_job_technician(p_business_id uuid,p_job_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.job_assignments a join public.technician_profiles t
   on t.id=a.technician_id and t.business_id=a.business_id
  where a.business_id=p_business_id and a.job_id=p_job_id and a.is_active
    and a.assignment_role='primary' and t.member_user_id=auth.uid()
    and t.is_active and t.is_technician and t.can_be_assigned_jobs);
$$;
revoke all on function public.is_active_primary_job_technician(uuid,uuid) from public;
grant execute on function public.is_active_primary_job_technician(uuid,uuid) to authenticated,service_role;

create or replace function public.transition_assigned_job_status_v2(p_job_id uuid,p_status text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job public.jobs%rowtype; v_fingerprint text; v_existing public.job_mutation_requests%rowtype; v_allowed boolean; v_outcome jsonb;
begin
 if auth.uid() is null or p_request_id is null then raise exception 'Authentication and request ID are required' using errcode='insufficient_privilege'; end if;
 select * into v_job from public.jobs where id=p_job_id and is_deleted=false for update;
 if v_job.id is null or not public.is_active_primary_job_technician(v_job.business_id,v_job.id) then raise exception 'Assigned primary job not found' using errcode='insufficient_privilege'; end if;
 v_fingerprint:=encode(digest(jsonb_build_object('status',p_status)::text,'sha256'),'hex');
 select * into v_existing from public.job_mutation_requests where actor_user_id=auth.uid() and business_id=v_job.business_id and job_id=v_job.id and operation='technician_status_transition' and request_id=p_request_id for update;
 if found then
   if v_existing.request_fingerprint<>v_fingerprint then raise exception 'Request ID was reused with different input' using errcode='unique_violation'; end if;
   return v_existing.outcome;
 end if;
 v_allowed:=case v_job.status when 'dispatched' then p_status='en_route' when 'en_route' then p_status='arrived' when 'arrived' then p_status='in_progress' when 'in_progress' then p_status='completed' else false end;
 if not v_allowed then raise exception 'Invalid job status transition: % to %',v_job.status,p_status using errcode='check_violation'; end if;
 perform set_config('servonas.assignment_sync','on',true);
 update public.jobs set status=p_status,actual_arrival_at=case when p_status='arrived' then now() else actual_arrival_at end,work_started_at=case when p_status='in_progress' then now() else work_started_at end,work_completed_at=case when p_status='completed' then now() else work_completed_at end,updated_by=auth.uid() where id=v_job.id and business_id=v_job.business_id;
 update public.technician_profiles set technician_status=case when p_status='en_route' then 'en_route' when p_status in ('arrived','in_progress') then 'on_site' when p_status='completed' then 'available' else technician_status end where id=v_job.assigned_technician_id and business_id=v_job.business_id and technician_status<>'off_duty';
 perform set_config('servonas.assignment_sync','off',true);
 v_outcome:=jsonb_build_object('status',p_status,'job_id',v_job.id,'replayed',false);
 insert into public.job_mutation_requests(business_id,job_id,actor_user_id,operation,request_id,request_fingerprint,outcome) values(v_job.business_id,v_job.id,auth.uid(),'technician_status_transition',p_request_id,v_fingerprint,v_outcome);
 return v_outcome;
end $$;

create or replace function public.append_assigned_job_note_v2(p_job_id uuid,p_note text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job public.jobs%rowtype; v_fingerprint text; v_existing public.job_mutation_requests%rowtype; v_note_id uuid; v_name text; v_outcome jsonb;
begin
 if auth.uid() is null or p_request_id is null then raise exception 'Authentication and request ID are required' using errcode='insufficient_privilege'; end if;
 if length(trim(coalesce(p_note,'')))<1 or length(p_note)>4000 then raise exception 'Note must contain between 1 and 4000 characters' using errcode='check_violation'; end if;
 select * into v_job from public.jobs where id=p_job_id and is_deleted=false for update;
 if v_job.id is null or not public.is_active_assigned_job_technician(v_job.business_id,v_job.id) then raise exception 'Assigned job not found' using errcode='insufficient_privilege'; end if;
 v_fingerprint:=encode(digest(jsonb_build_object('body',trim(p_note))::text,'sha256'),'hex');
 select * into v_existing from public.job_mutation_requests where actor_user_id=auth.uid() and business_id=v_job.business_id and job_id=v_job.id and operation='technician_note' and request_id=p_request_id for update;
 if found then if v_existing.request_fingerprint<>v_fingerprint then raise exception 'Request ID was reused with different input' using errcode='unique_violation'; end if; return v_existing.outcome; end if;
 v_name:=public.timeline_actor_name(auth.uid());
 insert into public.job_notes(business_id,job_id,body,note_type,author_id,author_name) values(v_job.business_id,v_job.id,trim(p_note),'technician',auth.uid(),v_name) returning id into v_note_id;
 update public.jobs set internal_notes=concat_ws(E'\n\n',nullif(internal_notes,''),'['||v_name||'] '||trim(p_note)),updated_by=auth.uid() where id=v_job.id and business_id=v_job.business_id;
 v_outcome:=jsonb_build_object('note_id',v_note_id,'job_id',v_job.id,'replayed',false);
 insert into public.job_mutation_requests(business_id,job_id,actor_user_id,operation,request_id,request_fingerprint,outcome) values(v_job.business_id,v_job.id,auth.uid(),'technician_note',p_request_id,v_fingerprint,v_outcome);
 return v_outcome;
end $$;
revoke all on function public.transition_assigned_job_status_v2(uuid,text,uuid),public.append_assigned_job_note_v2(uuid,text,uuid) from public;
grant execute on function public.transition_assigned_job_status_v2(uuid,text,uuid),public.append_assigned_job_note_v2(uuid,text,uuid) to authenticated;

-- Legacy callers retain behavior but can no longer authorize helpers. Their
-- server-generated request IDs make each invocation a new operation; migrate callers to v2 for replay safety.
create or replace function public.transition_assigned_job_status(p_job_id uuid,p_status text) returns text language plpgsql security definer set search_path=public as $$ declare v jsonb; begin v:=public.transition_assigned_job_status_v2(p_job_id,p_status,gen_random_uuid()); return v->>'status'; end $$;
create or replace function public.append_assigned_job_note(p_job_id uuid,p_note text) returns void language plpgsql security definer set search_path=public as $$ begin perform public.append_assigned_job_note_v2(p_job_id,p_note,gen_random_uuid()); end $$;
revoke all on function public.transition_assigned_job_status(uuid,text),public.append_assigned_job_note(uuid,text) from public;
grant execute on function public.transition_assigned_job_status(uuid,text),public.append_assigned_job_note(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
