drop policy if exists "Data is modifiable by their users" on "public"."account";
drop policy if exists "Data is publicly visible" on "public"."account";
drop policy if exists "Data is modifiable by their users" on "public"."archive_upload";
drop policy if exists "Data is publicly visible" on "public"."archive_upload";
drop policy if exists "Data is modifiable by their users" on "public"."followers";
drop policy if exists "Data is publicly visible unless marked private" on "public"."followers";
drop policy if exists "Data is modifiable by their users" on "public"."following";
drop policy if exists "Data is publicly visible unless marked private" on "public"."following";
drop policy if exists "Data is modifiable by their users" on "public"."likes";
drop policy if exists "Data is publicly visible unless marked private" on "public"."likes";
drop policy if exists "Data is modifiable by their users" on "public"."profile";
drop policy if exists "Data is publicly visible unless marked private" on "public"."profile";
drop policy if exists "Entities are publicly visible unless marked private" on "public"."tweet_media";
drop policy if exists "Entities are publicly visible unless marked private" on "public"."tweet_urls";
drop policy if exists "Data is modifiable by their users" on "public"."tweets";
drop policy if exists "Data is publicly visible unless marked private" on "public"."tweets";
drop policy if exists "Entities are publicly visible unless marked private" on "public"."user_mentions";
drop function if exists "public"."apply_public_rls_policies_not_private"(schema_name text, table_name text);
drop function if exists "public"."drop_all_policies"(schema_name text, table_name text);
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.apply_public_entities_rls_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;

    EXECUTE format('CREATE POLICY "Entities are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Entities are modifiable by their users" ON %I.%I to authenticated
        USING (
            EXISTS (
                SELECT 1 
                FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )
        ) 
        WITH CHECK (
            EXISTS (
                SELECT 1 
                FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )
        )', schema_name, table_name, table_name, table_name);
END;
$function$;
CREATE OR REPLACE FUNCTION public.apply_public_rls_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    EXECUTE format('CREATE POLICY "Tweets are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Tweets are modifiable by their users" ON %I.%I to authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$function$;
create policy "Account are modifiable by their users"
on "public"."account"
as permissive
for all
to authenticated
using ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)))
with check ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)));
create policy "Account are publicly visible"
on "public"."account"
as permissive
for select
to public
using (true);
create policy "Archive Upload are modifiable by their users"
on "public"."archive_upload"
as permissive
for all
to authenticated
using ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)))
with check ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)));
create policy "Archive Upload are publicly visible"
on "public"."archive_upload"
as permissive
for select
to public
using (true);
create policy "Followers are modifiable by their users"
on "public"."followers"
as permissive
for all
to authenticated
using ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)))
with check ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)));
create policy "Followers are publicly visible"
on "public"."followers"
as permissive
for select
to public
using (true);
create policy "Following are modifiable by their users"
on "public"."following"
as permissive
for all
to authenticated
using ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)))
with check ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)));
create policy "Following are publicly visible"
on "public"."following"
as permissive
for select
to public
using (true);
create policy "Likes are modifiable by their users"
on "public"."likes"
as permissive
for all
to authenticated
using ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)))
with check ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)));
create policy "Likes are publicly visible"
on "public"."likes"
as permissive
for select
to public
using (true);
create policy "Profile are modifiable by their users"
on "public"."profile"
as permissive
for all
to authenticated
using ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)))
with check ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)));
create policy "Profile are publicly visible"
on "public"."profile"
as permissive
for select
to public
using (true);
create policy "Media are publicly visible"
on "public"."tweet_media"
as permissive
for select
to public
using (true);
create policy "Urls are publicly visible"
on "public"."tweet_urls"
as permissive
for select
to public
using (true);
create policy "Tweets are modifiable by their users"
on "public"."tweets"
as permissive
for all
to authenticated
using ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)))
with check ((account_id = ((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'provider_id'::text)));
create policy "Tweets are publicly visible"
on "public"."tweets"
as permissive
for select
to public
using (true);
create policy "User Mentions are publicly visible"
on "public"."user_mentions"
as permissive
for select
to public
using (true);