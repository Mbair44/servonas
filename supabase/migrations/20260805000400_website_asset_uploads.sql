-- Public website imagery uploaded after an authenticated, authorized server action.
-- Uploads use the service role; public websites only require read access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('website-assets','website-assets',true,8388608,array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
