-- Epic 6 Checkpoint 3: estimate authoring support.
begin;

alter table public.estimates
  add column if not exists request_key uuid,
  add column if not exists document_discount_type text not null default 'none',
  add column if not exists document_discount_value bigint not null default 0;
alter table public.estimates add constraint estimates_document_discount_type_check
  check (document_discount_type in ('none','fixed','percentage'));
alter table public.estimates add constraint estimates_document_discount_value_check
  check (
    document_discount_value >= 0 and
    (document_discount_type <> 'percentage' or document_discount_value <= 10000)
  );
create unique index estimates_business_request_key_unique
  on public.estimates(business_id,request_key) where request_key is not null;

create table public.estimate_fees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  estimate_id uuid not null,
  name_snapshot text not null check (length(trim(name_snapshot)) between 1 and 160),
  amount_cents bigint not null check (amount_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id,id),
  constraint estimate_fees_estimate_fk foreign key (business_id,estimate_id)
    references public.estimates(business_id,id) on delete cascade
);
create index estimate_fees_estimate_idx on public.estimate_fees(business_id,estimate_id,sort_order);
alter table public.estimate_fees enable row level security;
create policy "financial office reads estimate_fees" on public.estimate_fees
  for select to authenticated using (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "financial office creates estimate_fees" on public.estimate_fees
  for insert to authenticated with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "financial office updates estimate_fees" on public.estimate_fees
  for update to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "financial office deletes estimate_fees" on public.estimate_fees
  for delete to authenticated using (public.has_business_role(business_id,array['owner','admin','manager']));

-- Draft line replacement is needed by the authoring screen. Final document
-- snapshots and document guards continue protecting accepted terms.
create policy "financial office deletes draft estimate lines" on public.estimate_line_items
  for delete to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and exists (
      select 1 from public.estimates
      where estimates.id=estimate_line_items.estimate_id
        and estimates.business_id=estimate_line_items.business_id
        and estimates.status='draft'
    )
  );

commit;
