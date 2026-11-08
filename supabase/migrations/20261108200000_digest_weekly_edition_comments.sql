-- Reader comments on a published weekly edition, mirroring
-- digest_edition_comments. The display identity is captured at write time so
-- rendering never joins auth.users; writes go through the API's service-role
-- client after session verification. Deletes are soft.
create table if not exists "public"."digest_weekly_edition_comments" (
    "id" uuid primary key default gen_random_uuid(),
    "edition_id" uuid not null references "public"."digest_weekly_editions"("id") on delete cascade,
    "user_id" uuid not null references "auth"."users"("id") on delete cascade,
    "content" text not null,
    "username" text,
    "display_name" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz,
    constraint "digest_weekly_edition_comments_content_length_check"
      check (char_length("content") between 1 and 2000)
);
alter table "public"."digest_weekly_edition_comments" owner to "postgres";

create index if not exists "digest_weekly_edition_comments_edition_created_idx"
  on "public"."digest_weekly_edition_comments" ("edition_id", "created_at");

alter table "public"."digest_weekly_edition_comments" enable row level security;

drop policy if exists "Published weekly digest comments are publicly readable"
  on "public"."digest_weekly_edition_comments";
create policy "Published weekly digest comments are publicly readable"
  on "public"."digest_weekly_edition_comments"
  for select
  to "anon", "authenticated"
  using (exists (
    select 1
    from "public"."digest_weekly_editions" as "edition"
    where "edition"."id" = "digest_weekly_edition_comments"."edition_id"
      and "edition"."status" = 'published'
  ));

revoke all privileges on table "public"."digest_weekly_edition_comments" from "anon", "authenticated";
grant all privileges on table "public"."digest_weekly_edition_comments" to "service_role";
grant select on table "public"."digest_weekly_edition_comments" to "anon", "authenticated";
