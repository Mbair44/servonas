-- Retain the original private MMS video for audit/download purposes while the
-- inbox serves a browser-compatible MP4 derivative from storage_path.
alter table public.customer_message_attachments
  add column if not exists original_storage_path text;

create unique index if not exists customer_message_attachments_original_storage_path_key
  on public.customer_message_attachments(original_storage_path)
  where original_storage_path is not null;
