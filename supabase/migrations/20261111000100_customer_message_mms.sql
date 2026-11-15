begin;

-- Private, tenant-owned MMS files. Twilio URLs are deliberately never retained.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('customer-message-media','customer-message-media',false,5242880,array['image/jpeg','image/png','image/gif','video/mp4','video/3gpp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.customer_messages drop constraint if exists customer_messages_body_check;
alter table public.customer_messages alter column body set default '';
alter table public.customer_messages add constraint customer_messages_body_check check(length(body)<=1600);
alter table public.customer_messages add constraint customer_messages_business_id_id_unique unique(business_id,id);
alter table public.customer_message_send_requests drop constraint if exists customer_message_send_requests_body_check;
alter table public.customer_message_send_requests add constraint customer_message_send_requests_body_check check(length(body)<=1600);
alter table public.customer_message_send_requests add column if not exists attachment_ids uuid[] not null default '{}';

create table if not exists public.customer_message_attachments (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 message_id uuid references public.customer_messages(id) on delete cascade,
 outbound_request_id uuid,
 ordinal smallint not null check(ordinal>=0 and ordinal<10),
 direction text not null check(direction in ('inbound','outbound')),
 content_type text not null,
 file_size_bytes integer,
 storage_path text,
 processing_status text not null default 'queued' check(processing_status in ('queued','processing','ready','failed','uploaded')),
 processing_attempts integer not null default 0 check(processing_attempts>=0), next_attempt_at timestamptz not null default now(),
 failure_reason text,
 provider_media_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), processed_at timestamptz,
 unique(message_id,ordinal), unique(outbound_request_id,ordinal), unique(storage_path),
 constraint customer_message_attachments_message_tenant_fk foreign key(business_id,message_id) references public.customer_messages(business_id,id) on delete cascade
);
create index if not exists customer_message_attachments_queue_idx on public.customer_message_attachments(next_attempt_at,created_at) where processing_status in ('queued','failed');
create index if not exists customer_message_attachments_message_idx on public.customer_message_attachments(business_id,message_id,ordinal);
alter table public.customer_message_attachments enable row level security;
create policy "members read customer message attachments" on public.customer_message_attachments for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage customer message attachments" on public.customer_message_attachments for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read customer message media" on storage.objects for select to authenticated using(bucket_id='customer-message-media' and public.is_business_member(((storage.foldername(name))[1])::uuid));
create policy "managers upload customer message media" on storage.objects for insert to authenticated with check(bucket_id='customer-message-media' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']));
create policy "managers delete customer message media" on storage.objects for delete to authenticated using(bucket_id='customer-message-media' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']));
notify pgrst,'reload schema';
commit;
