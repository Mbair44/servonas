begin;
create table public.platform_fee_reconciliation_cases(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
 connected_account_id text,provider_payment_intent_id text,provider_checkout_session_id text,reservation_id uuid references public.platform_fee_reservations(id) on delete restrict,
 exception_type text not null check(exception_type in('missing_application_fee','checkout_expiration_uncertain','refund_uncertain','dispute_opened','dispute_final','fee_mismatch')),
 status text not null default 'open' check(status in('open','retrying','resolved','manual_review')),
 retry_count integer not null default 0,next_retry_at timestamptz not null default now(),last_error text,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),resolved_at timestamptz,
 unique(reservation_id,exception_type,status)
);
alter table public.platform_fee_reconciliation_cases enable row level security;
create policy "platform admins read platform fee reconciliation" on public.platform_fee_reconciliation_cases for select to authenticated using(public.is_servonas_platform_admin());
revoke insert,update,delete on public.platform_fee_reconciliation_cases from anon,authenticated;
notify pgrst,'reload schema';
commit;
