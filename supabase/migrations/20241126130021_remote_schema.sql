drop policy "Allow authenticated uploads" on "storage"."objects";
create policy "Allow authenticated uploads"
on "storage"."objects"
as permissive
for insert
to authenticated
with check ((bucket_id = 'archives'::text));
