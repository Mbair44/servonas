-- Epic 5 Checkpoint 8: tenant-scoped technician availability exceptions.
create table if not exists public.technician_time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  technician_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint technician_time_off_order_check check (ends_at > starts_at),
  constraint technician_time_off_technician_tenant_fk
    foreign key (business_id,technician_id)
    references public.technician_profiles(business_id,id) on delete cascade
);

create index if not exists technician_time_off_lookup_idx
  on public.technician_time_off(business_id,technician_id,starts_at,ends_at);

alter table public.technician_time_off enable row level security;

create policy "operations manages technician time off"
  on public.technician_time_off for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and created_by=auth.uid()
  );

create policy "technicians view own time off"
  on public.technician_time_off for select to authenticated
  using (
    exists (
      select 1 from public.technician_profiles technician
      where technician.id=technician_id
        and technician.business_id=business_id
        and technician.member_user_id=auth.uid()
    )
  );
