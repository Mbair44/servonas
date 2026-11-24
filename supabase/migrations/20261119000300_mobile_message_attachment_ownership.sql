-- Mobile MMS draft ownership is deliberately separate from outbound_request_id:
-- the latter is unique per draft/ordinal and cannot identify a user.
alter table public.customer_message_attachments
  add column if not exists uploaded_by_user_id uuid;

create index if not exists customer_message_attachments_mobile_owner_idx
  on public.customer_message_attachments(business_id, uploaded_by_user_id)
  where direction = 'outbound' and message_id is null;
