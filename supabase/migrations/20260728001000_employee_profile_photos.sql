begin;

alter table public.employees add column if not exists profile_photo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('employee-profile-photos','employee-profile-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "members read employee profile photos" on storage.objects;
create policy "members read employee profile photos" on storage.objects for select to authenticated using(
 bucket_id='employee-profile-photos' and public.is_business_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "admins upload employee profile photos" on storage.objects;
create policy "admins upload employee profile photos" on storage.objects for insert to authenticated with check(
 bucket_id='employee-profile-photos' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);
drop policy if exists "admins remove employee profile photos" on storage.objects;
create policy "admins remove employee profile photos" on storage.objects for delete to authenticated using(
 bucket_id='employee-profile-photos' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);

comment on column public.employees.profile_photo_path is 'Private employee profile photo Storage path.';
commit;
