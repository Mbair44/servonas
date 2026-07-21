-- NRS Party Rentals: SMS templates, delivery log, receipt links, and scheduled-message tracking.
begin;

alter table public.bookings
  add column if not exists receipt_token uuid not null default gen_random_uuid(),
  add column if not exists stripe_receipt_url text,
  add column if not exists confirmation_sms_sent_at timestamptz,
  add column if not exists reminder_sms_sent_at timestamptz,
  add column if not exists review_sms_sent_at timestamptz;

create unique index if not exists bookings_receipt_token_unique on public.bookings(receipt_token);

create table if not exists public.sms_templates (
  template_key text primary key check (template_key in ('confirmation','reminder','review')),
  display_name text not null,
  body text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.sms_templates(template_key, display_name, body, enabled) values
('confirmation','Booking confirmation','Hi {customerName}! Your NRS Party Rentals reservation #{bookingNumber} for {eventDate} is confirmed. Items: {items}. Deposit paid: {depositPaid}. Balance due: {balanceDue}. Receipt: {receiptLink}',true),
('reminder','One-day reminder','Hi {customerName}! Reminder: your NRS Party Rentals reservation #{bookingNumber} is tomorrow, {eventDate}. Items: {items}. Delivery: {deliveryAddress}. Balance due: {balanceDue}. Receipt: {receiptLink}',true),
('review','Review request','Thanks for renting from NRS Party Rentals, {customerName}! We hope your event was amazing. Receipt: {receiptLink}. Would you leave us a Google review? {googleReviewLink}',true)
on conflict (template_key) do nothing;

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  template_key text,
  to_phone text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  twilio_message_sid text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sms_messages_booking_created_idx on public.sms_messages(booking_id, created_at desc);

alter table public.sms_templates enable row level security;
alter table public.sms_messages enable row level security;

commit;
