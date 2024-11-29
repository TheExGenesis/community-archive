DO $$
BEGIN
  -- Check if the bucket already exists
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE name = 'archives'
  ) THEN
    -- Insert a new bucket if it doesn't exist
    INSERT INTO storage.buckets (id, name, public)
    VALUES (
      'archives',     -- Generate a unique UUID for the bucket
      'archives',    -- Replace with your desired bucket name
      true           -- Set to 'true' for a public bucket, 'false' for private
    );
  END IF;
END $$;

DO $$
BEGIN
PERFORM public.drop_all_policies('storage', 'objects');
END $$;
create policy "Allow authenticated uploads"
on storage.objects
for insert
to authenticated
with check ((bucket_id = 'archives'::text) AND (LOWER(((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'user_name'::text)) = LOWER((storage.foldername(name))[1])));
create policy "Allow authenticated archive deletes"
on storage.objects
for delete
to authenticated
using ((bucket_id = 'archives'::text) AND (LOWER(((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'user_name'::text)) = LOWER((storage.foldername(name))[1])));
create policy "Allow authenticated archive updates"
on storage.objects
for update
using (bucket_id = 'archives'::text)
with check ((bucket_id = 'archives'::text) AND (LOWER(((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'user_name'::text)) = LOWER((storage.foldername(name))[1])));
create policy "Allow archive access based on privacy setting"
on storage.objects
for select
using (bucket_id = 'archives'::text);
