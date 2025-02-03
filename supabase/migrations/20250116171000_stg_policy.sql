create policy "Allow archive access"
on storage.objects
for select
using (
  bucket_id = 'archives'::text
);
