DO $$
BEGIN
PERFORM public.drop_all_policies('storage', 'objects');
END $$;

create policy "Allow authenticated uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archives'::text AND
  ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'user_name'::text) = (storage.foldername(name))[1]
);

create policy "Allow authenticated archive deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'archives'::text AND
  ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'user_name'::text) = (storage.foldername(name))[1]
);

create policy "Allow authenticated archive updates"
on storage.objects
for update
using (bucket_id = 'archives'::text)
with check (
  bucket_id = 'archives'::text AND
  ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'user_name'::text) = (storage.foldername(name))[1]
);

create policy "Allow archive access based on privacy setting"
on storage.objects
for select
using (
  bucket_id = 'archives'::text AND (
    ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'user_name'::text) = (storage.foldername(name))[1]
    OR
    EXISTS (
      SELECT 1 FROM public.archive_upload au
      WHERE au.account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)
      AND au.keep_private = false
      AND au.archive_at = (
        SELECT MAX(archive_at)
        FROM public.archive_upload
        WHERE account_id = au.account_id
      )
    )
  )
);
