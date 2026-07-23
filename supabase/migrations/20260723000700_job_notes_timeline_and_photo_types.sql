-- Epic 5 Checkpoint 7: structured notes, domain events, and typed photos.
create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 4000),
  note_type text not null default 'internal'
    check (note_type in ('internal','customer_visible','technician')),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default 'Team member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_notes_job_tenant_fk foreign key (business_id,job_id)
    references public.jobs(business_id,id) on delete cascade
);
create index if not exists job_notes_job_created_idx
  on public.job_notes(business_id,job_id,created_at desc);
alter table public.job_notes enable row level security;

create table if not exists public.job_timeline_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null,
  event_type text not null check (event_type in (
    'job_created','job_scheduled','technician_assigned','status_changed',
    'note_added','note_edited','photo_uploaded','photo_removed',
    'job_rescheduled','job_cancelled','job_completed'
  )),
  summary text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  metadata jsonb not null default '{}'::jsonb,
  source_key text,
  occurred_at timestamptz not null default now(),
  constraint job_timeline_events_job_tenant_fk foreign key (business_id,job_id)
    references public.jobs(business_id,id) on delete cascade,
  constraint job_timeline_events_source_unique unique (job_id,source_key)
);
create index if not exists job_timeline_job_occurred_idx
  on public.job_timeline_events(business_id,job_id,occurred_at desc);
alter table public.job_timeline_events enable row level security;

alter table public.job_photos
  add column if not exists photo_type text not null default 'general';
alter table public.job_photos drop constraint if exists job_photos_type_check;
alter table public.job_photos add constraint job_photos_type_check
  check (photo_type in ('before','after','general'));

create or replace function public.timeline_actor_name(p_user_id uuid)
returns text language sql stable security definer set search_path=public
as $$
  select coalesce(
    (select nullif(trim(full_name),'') from public.profiles where id=p_user_id),
    'Team member'
  );
$$;
revoke all on function public.timeline_actor_name(uuid) from public;
grant execute on function public.timeline_actor_name(uuid) to authenticated,service_role;

create or replace function public.set_job_note_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists job_notes_updated_at on public.job_notes;
create trigger job_notes_updated_at before update on public.job_notes
for each row execute function public.set_job_note_updated_at();

create or replace function public.log_job_domain_events()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text := public.timeline_actor_name(auth.uid());
begin
  if tg_op='INSERT' then
    insert into public.job_timeline_events(
      business_id,job_id,event_type,summary,actor_id,actor_name,source_key,occurred_at
    ) values (
      new.business_id,new.id,'job_created','Job created',v_actor,v_actor_name,
      'job-created',new.created_at
    ) on conflict(job_id,source_key) do nothing;
    if new.starts_at is not null then
      insert into public.job_timeline_events(
        business_id,job_id,event_type,summary,actor_id,actor_name,metadata
      ) values (
        new.business_id,new.id,'job_scheduled','Job scheduled',v_actor,v_actor_name,
        jsonb_build_object('starts_at',new.starts_at,'ends_at',new.ends_at)
      );
    end if;
  else
    if new.assigned_technician_id is distinct from old.assigned_technician_id then
      insert into public.job_timeline_events(
        business_id,job_id,event_type,summary,actor_id,actor_name,metadata
      ) values (
        new.business_id,new.id,'technician_assigned',
        case when new.assigned_technician_id is null then 'Technician unassigned' else 'Technician assigned' end,
        v_actor,v_actor_name,
        jsonb_build_object('technician_id',new.assigned_technician_id)
      );
    end if;
    if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
      insert into public.job_timeline_events(
        business_id,job_id,event_type,summary,actor_id,actor_name,metadata
      ) values (
        new.business_id,new.id,
        case when old.starts_at is null then 'job_scheduled' else 'job_rescheduled' end,
        case when old.starts_at is null then 'Job scheduled' else 'Job rescheduled' end,
        v_actor,v_actor_name,
        jsonb_build_object('starts_at',new.starts_at,'ends_at',new.ends_at)
      );
    end if;
    if new.status is distinct from old.status then
      insert into public.job_timeline_events(
        business_id,job_id,event_type,summary,actor_id,actor_name,metadata
      ) values (
        new.business_id,new.id,
        case
          when new.status='canceled' then 'job_cancelled'
          when new.status='completed' then 'job_completed'
          else 'status_changed'
        end,
        case
          when new.status='canceled' then 'Job cancelled'
          when new.status='completed' then 'Job completed'
          else 'Status changed to '||replace(new.status,'_',' ')
        end,
        v_actor,v_actor_name,
        jsonb_build_object('from_status',old.status,'to_status',new.status)
      );
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_domain_timeline on public.jobs;
create trigger jobs_domain_timeline after insert or update on public.jobs
for each row execute function public.log_job_domain_events();

create or replace function public.log_job_note_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.job_timeline_events(
    business_id,job_id,event_type,summary,actor_id,actor_name,metadata
  ) values (
    new.business_id,new.job_id,
    case when tg_op='INSERT' then 'note_added' else 'note_edited' end,
    case when tg_op='INSERT' then 'Note added' else 'Note edited' end,
    auth.uid(),public.timeline_actor_name(auth.uid()),
    jsonb_build_object('note_id',new.id,'note_type',new.note_type)
  );
  return new;
end;
$$;
drop trigger if exists job_notes_timeline on public.job_notes;
create trigger job_notes_timeline after insert or update on public.job_notes
for each row execute function public.log_job_note_event();

create or replace function public.log_job_photo_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_photo public.job_photos%rowtype;
begin
  if tg_op='DELETE' then
    v_photo := old;
  else
    v_photo := new;
  end if;
  insert into public.job_timeline_events(
    business_id,job_id,event_type,summary,actor_id,actor_name,metadata
  ) values (
    v_photo.business_id,v_photo.job_id,
    case when tg_op='DELETE' then 'photo_removed' else 'photo_uploaded' end,
    case when tg_op='DELETE' then 'Photo removed' else initcap(v_photo.photo_type)||' photo uploaded' end,
    auth.uid(),public.timeline_actor_name(auth.uid()),
    jsonb_build_object('photo_id',v_photo.id,'photo_type',v_photo.photo_type)
  );
  return v_photo;
end;
$$;
drop trigger if exists job_photos_timeline on public.job_photos;
create trigger job_photos_timeline after insert or delete on public.job_photos
for each row execute function public.log_job_photo_event();

drop policy if exists "office and assigned technicians view job notes" on public.job_notes;
create policy "office and assigned technicians view job notes" on public.job_notes
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.is_assigned_technician(business_id,job_id)
  );
drop policy if exists "office adds job notes" on public.job_notes;
create policy "office adds job notes" on public.job_notes
  for insert to authenticated with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and author_id=auth.uid()
  );
drop policy if exists "assigned technicians add technician notes" on public.job_notes;
create policy "assigned technicians add technician notes" on public.job_notes
  for insert to authenticated with check (
    public.is_assigned_technician(business_id,job_id)
    and author_id=auth.uid()
    and note_type='technician'
  );
drop policy if exists "authors and office edit job notes" on public.job_notes;
create policy "authors and office edit job notes" on public.job_notes
  for update to authenticated
  using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or (author_id=auth.uid() and public.is_assigned_technician(business_id,job_id))
  )
  with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or (author_id=auth.uid() and note_type='technician' and public.is_assigned_technician(business_id,job_id))
  );

drop policy if exists "office and assigned technicians view timeline" on public.job_timeline_events;
create policy "office and assigned technicians view timeline" on public.job_timeline_events
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.is_assigned_technician(business_id,job_id)
  );

drop policy if exists "assigned technicians remove own photos" on public.job_photos;
create policy "assigned technicians remove own photos" on public.job_photos
  for delete to authenticated using (
    uploaded_by=auth.uid()
    and public.is_assigned_technician(business_id,job_id)
  );
drop policy if exists "assigned technicians remove photo objects" on storage.objects;
create policy "assigned technicians remove photo objects" on storage.objects
  for delete to authenticated using (
    bucket_id='job-photos'
    and public.is_assigned_technician(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

-- Preserve useful legacy note content without making old screens inconsistent.
alter table public.job_notes disable trigger job_notes_timeline;
insert into public.job_notes(
  business_id,job_id,body,note_type,author_name,created_at,updated_at
)
select business_id,id,internal_notes,'internal','Legacy job record',created_at,updated_at
from public.jobs where nullif(trim(internal_notes),'') is not null;
insert into public.job_notes(
  business_id,job_id,body,note_type,author_name,created_at,updated_at
)
select business_id,id,customer_notes,'customer_visible','Legacy job record',created_at,updated_at
from public.jobs where nullif(trim(customer_notes),'') is not null;
alter table public.job_notes enable trigger job_notes_timeline;

insert into public.job_timeline_events(
  business_id,job_id,event_type,summary,actor_id,actor_name,source_key,occurred_at
)
select business_id,id,'job_created','Job created',created_by,
  public.timeline_actor_name(created_by),'job-created',created_at
from public.jobs
on conflict(job_id,source_key) do nothing;
insert into public.job_timeline_events(
  business_id,job_id,event_type,summary,actor_id,actor_name,metadata,source_key,occurred_at
)
select business_id,job_id,
  case when to_status='canceled' then 'job_cancelled'
       when to_status='completed' then 'job_completed'
       else 'status_changed' end,
  case when to_status='canceled' then 'Job cancelled'
       when to_status='completed' then 'Job completed'
       else 'Status changed to '||replace(to_status,'_',' ') end,
  changed_by,public.timeline_actor_name(changed_by),
  jsonb_build_object('from_status',from_status,'to_status',to_status),
  'status-'||id::text,changed_at
from public.job_status_history
on conflict(job_id,source_key) do nothing;

-- Technician note RPC now writes the structured record and retains the legacy
-- field as a compatibility read model.
create or replace function public.append_assigned_job_note(
  p_job_id uuid,
  p_note text
) returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_business_id uuid;
  v_name text;
begin
  if length(trim(coalesce(p_note,'')))<1 or length(p_note)>4000 then
    raise exception 'Note must contain between 1 and 4000 characters'
      using errcode='check_violation';
  end if;
  select business_id into v_business_id from public.jobs
  where id=p_job_id and is_deleted=false;
  if v_business_id is null or not public.is_assigned_technician(v_business_id,p_job_id) then
    raise exception 'Assigned job not found' using errcode='insufficient_privilege';
  end if;
  v_name := public.timeline_actor_name(auth.uid());
  insert into public.job_notes(
    business_id,job_id,body,note_type,author_id,author_name
  ) values (
    v_business_id,p_job_id,trim(p_note),'technician',auth.uid(),v_name
  );
  update public.jobs set
    internal_notes=concat_ws(E'\n\n',nullif(internal_notes,''),'['||v_name||'] '||trim(p_note)),
    updated_by=auth.uid()
  where id=p_job_id and business_id=v_business_id;
end;
$$;
revoke all on function public.append_assigned_job_note(uuid,text) from public;
grant execute on function public.append_assigned_job_note(uuid,text) to authenticated;
