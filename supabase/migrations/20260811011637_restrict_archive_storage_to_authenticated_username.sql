-- #372(a): keep archive object paths bound to the authenticated account.
--
-- The browser now derives the folder from the Twitter identity returned by
-- auth.getUser(). These policies independently enforce the same trusted
-- app_metadata value, so a modified client cannot overwrite another user's
-- archive. The filename restriction also keeps browser writes within the one
-- object shape consumed by the archive worker.
--
-- Remove the legacy dashboard policies, including the trailing-space policy
-- whose unscoped `using (true)` also exposed objects in private buckets.

begin;

drop policy if exists "Allow archive access " on storage.objects;
drop policy if exists "Allow archive access generally" on storage.objects;
drop policy if exists "Allow authenticated archive deletes" on storage.objects;
drop policy if exists "Allow authenticated archive updates" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;

drop policy if exists "Archives are publicly readable" on storage.objects;
drop policy if exists "Users can upload their own archive" on storage.objects;
drop policy if exists "Users can update their own archive" on storage.objects;
drop policy if exists "Users can delete their own archive" on storage.objects;

create policy "Archives are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'archives');

create policy "Users can upload their own archive"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archives'
  and storage.filename(name) = 'archive.json'
  and lower((storage.foldername(name))[1]) =
      lower((select auth.jwt() -> 'app_metadata' ->> 'user_name'))
);

create policy "Users can update their own archive"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'archives'
  and storage.filename(name) = 'archive.json'
  and lower((storage.foldername(name))[1]) =
      lower((select auth.jwt() -> 'app_metadata' ->> 'user_name'))
)
with check (
  bucket_id = 'archives'
  and storage.filename(name) = 'archive.json'
  and lower((storage.foldername(name))[1]) =
      lower((select auth.jwt() -> 'app_metadata' ->> 'user_name'))
);

create policy "Users can delete their own archive"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'archives'
  and storage.filename(name) = 'archive.json'
  and lower((storage.foldername(name))[1]) =
      lower((select auth.jwt() -> 'app_metadata' ->> 'user_name'))
);

commit;
