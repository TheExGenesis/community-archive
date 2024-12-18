create policy "Give users access to own folder 1wyvxej_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'dev_archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
create policy "Give users access to own folder 1wyvxej_1"
on "storage"."objects"
as permissive
for insert
to public
with check (((bucket_id = 'dev_archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
create policy "Give users access to own folder 1wyvxej_2"
on "storage"."objects"
as permissive
for update
to public
using (((bucket_id = 'dev_archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
create policy "Give users access to own folder 1wyvxej_3"
on "storage"."objects"
as permissive
for delete
to public
using (((bucket_id = 'dev_archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
create policy "Give users access to own folder. 16n9m9d_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'archives'::text) AND (bucket_id = 'archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
create policy "Give users access to own folder. 16n9m9d_1"
on "storage"."objects"
as permissive
for update
to public
using (((bucket_id = 'archives'::text) AND (bucket_id = 'archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])))
with check (((bucket_id = 'archives'::text) AND (bucket_id = 'archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
create policy "Give users access to own folder. 16n9m9d_2"
on "storage"."objects"
as permissive
for insert
to public
with check (((bucket_id = 'archives'::text) AND (bucket_id = 'archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
create policy "Give users access to own folder. 16n9m9d_3"
on "storage"."objects"
as permissive
for delete
to public
using (((bucket_id = 'archives'::text) AND (bucket_id = 'archives'::text) AND (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text) = (storage.foldername(name))[1])));
