-- Business-owned branding for the public booking experience.
alter table public.booking_settings
  add column if not exists logo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'booking-branding',
  'booking-branding',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "members can read booking branding" on storage.objects;
create policy "members can read booking branding" on storage.objects
  for select to authenticated using (
    bucket_id='booking-branding'
    and public.is_business_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "admins can upload booking branding" on storage.objects;
create policy "admins can upload booking branding" on storage.objects
  for insert to authenticated with check (
    bucket_id='booking-branding'
    and public.has_business_role(
      ((storage.foldername(name))[1])::uuid,
      array['owner','admin']
    )
  );

drop policy if exists "admins can remove booking branding" on storage.objects;
create policy "admins can remove booking branding" on storage.objects
  for delete to authenticated using (
    bucket_id='booking-branding'
    and public.has_business_role(
      ((storage.foldername(name))[1])::uuid,
      array['owner','admin']
    )
  );

comment on column public.booking_settings.logo_path is
  'Private booking-branding Storage path. Preferred over legacy logo_url when present.';
