
CREATE OR REPLACE FUNCTION public.drop_all_policies(schema_name TEXT, table_name TEXT) RETURNS VOID AS $$
DECLARE
    policy_name TEXT;
BEGIN
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
PERFORM public.drop_all_policies('storage', 'objects');
END $$;

create policy "Allow authenticated uploads"
on storage.objects
for insert
to authenticated
with check ((bucket_id = 'dev_archives'::text) AND (
  EXISTS (
    SELECT 1 FROM public.account
    WHERE account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata') ->> 'provider_id'::text)
    AND username = (storage.foldername(name))[1]
  )
));


create policy "Allow authenticated archive deletes"
on storage.objects
for insert
to authenticated
with check ((bucket_id = 'dev_archives'::text) AND (
  EXISTS (
    SELECT 1 FROM public.account
    WHERE account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata') ->> 'provider_id'::text)
    AND username = (storage.foldername(name))[1]
  )
));


create policy "Allow authenticated archive updates"
on storage.objects
for update
using (bucket_id = 'dev_archives'::text)
with check ((bucket_id = 'dev_archives'::text) AND (
  EXISTS (
    SELECT 1 FROM public.account
    WHERE account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata') ->> 'provider_id'::text)
    AND username = (storage.foldername(name))[1]
  )
));

create policy "Allow archive access based on privacy setting"
on storage.objects
for select
using (
  bucket_id = 'dev_archives'::text AND (
    EXISTS (
      SELECT 1 FROM public.archive_upload au
      WHERE au.account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata') ->> 'provider_id'::text)
      AND au.keep_private = false
      AND au.archive_at = (
        SELECT MAX(archive_at)
        FROM public.archive_upload
        WHERE account_id = au.account_id
      )
    )
    OR
    (storage.foldername(name))[1] = (
      SELECT username FROM public.account
      WHERE account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata') ->> 'provider_id'::text)
    )
  )
);

