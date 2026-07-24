-- Epic 6 Checkpoint 7: privacy-preserving public invoice access audit/rate limit.
begin;

create table public.public_invoice_access_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  fingerprint_hash text not null check (length(fingerprint_hash)=64),
  was_allowed boolean not null,
  accessed_at timestamptz not null default now(),
  constraint public_invoice_access_invoice_fk foreign key (business_id,invoice_id)
    references public.invoices(business_id,id) on delete cascade
);
create index public_invoice_access_rate_idx
  on public.public_invoice_access_events(invoice_id,fingerprint_hash,accessed_at desc);
alter table public.public_invoice_access_events enable row level security;
-- No authenticated policies. Only the server-side service role can access this table.

alter table public.invoice_events drop constraint if exists invoice_events_event_type_check;
alter table public.invoice_events add constraint invoice_events_event_type_check
  check (event_type in (
    'created','updated','sent','viewed','payment_initiated','payment_succeeded',
    'payment_failed','partial_payment','paid','overdue','voided','refund_initiated',
    'refund_succeeded','refund_failed','offline_payment_recorded','receipt_sent',
    'public_link_accessed'
  ));

commit;
