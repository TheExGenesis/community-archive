-- The legacy prod.sql grants broad access to anon/authenticated. Clear any
-- PUBLIC grant too, then preserve only intended reads and service maintenance.
revoke all privileges on table public.scraper_count from public;
revoke delete on table "public"."scraper_count" from "anon";

revoke insert on table "public"."scraper_count" from "anon";

revoke references on table "public"."scraper_count" from "anon";

revoke trigger on table "public"."scraper_count" from "anon";

revoke truncate on table "public"."scraper_count" from "anon";

revoke update on table "public"."scraper_count" from "anon";

revoke delete on table "public"."scraper_count" from "authenticated";

revoke insert on table "public"."scraper_count" from "authenticated";

revoke references on table "public"."scraper_count" from "authenticated";

revoke trigger on table "public"."scraper_count" from "authenticated";

revoke truncate on table "public"."scraper_count" from "authenticated";

revoke update on table "public"."scraper_count" from "authenticated";

alter table "public"."scraper_count" enable row level security;

drop policy if exists "Scraper count is publicly readable"
  on "public"."scraper_count";
create policy "Scraper count is publicly readable"
on "public"."scraper_count"
as permissive
for select
to public
using (true);




grant all privileges on table public.scraper_count to service_role;
