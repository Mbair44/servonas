begin;
-- Service-only idempotency ledger. A claim is never automatically retried because
-- a network timeout can occur after Twilio accepts a message.
create table public.customer_message_send_requests (
 business_id uuid not null references public.businesses(id) on delete cascade,
 request_id uuid not null,
 conversation_key text not null,
 body text not null check(length(body) between 1 and 1600),
 provider_message_id text,
 created_at timestamptz not null default now(),
 primary key(business_id,request_id)
);
alter table public.customer_message_send_requests enable row level security;
revoke all on public.customer_message_send_requests from anon, authenticated;
notify pgrst,'reload schema';
commit;
