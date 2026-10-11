begin;

create table if not exists public.customer_messages (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid references public.customers(id) on delete set null,
 counterparty_phone_e164 text not null,
 direction text not null check(direction in ('inbound','outbound')),
 provider text not null default 'twilio',
 provider_message_id text,
 body text not null check(length(body) between 1 and 1600),
 status text not null default 'accepted',
 source_type text not null,
 read_at timestamptz,
 sent_at timestamptz,
 received_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(provider,provider_message_id)
);
create index if not exists customer_messages_thread_idx on public.customer_messages(business_id,counterparty_phone_e164,created_at desc);
create index if not exists customer_messages_customer_idx on public.customer_messages(business_id,customer_id,created_at desc);
alter table public.customer_messages enable row level security;
create policy "members read customer messages" on public.customer_messages for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage customer messages" on public.customer_messages for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));

-- Normalize existing inbound texts and legacy booking SMS without duplicate rows.
insert into public.customer_messages(business_id,customer_id,counterparty_phone_e164,direction,provider,provider_message_id,body,status,source_type,received_at,created_at)
select business_id,customer_id,from_phone_e164,'inbound',provider,provider_message_id,body,'received','inbound_sms',received_at,received_at from public.inbound_sms_messages
on conflict(provider,provider_message_id) do nothing;
notify pgrst,'reload schema';
commit;
