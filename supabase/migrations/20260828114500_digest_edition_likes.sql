-- Reader appreciation for a published edition. One like per user per edition;
-- writes go through the API's service-role client after session verification.
create table if not exists "public"."digest_edition_likes" (
    "id" uuid primary key default gen_random_uuid(),
    "edition_id" uuid not null references "public"."digest_editions"("id") on delete cascade,
    "user_id" uuid not null references "auth"."users"("id") on delete cascade,
    "created_at" timestamptz not null default now(),
    constraint "digest_edition_likes_edition_user_key" unique ("edition_id", "user_id")
);
alter table "public"."digest_edition_likes" owner to "postgres";

create index if not exists "digest_edition_likes_edition_idx"
  on "public"."digest_edition_likes" ("edition_id");

alter table "public"."digest_edition_likes" enable row level security;

-- Like counts are a public signal on published editions. Writes stay
-- service-role only; the API verifies the session before inserting or deleting.
create policy "Published digest edition likes are publicly readable"
  on "public"."digest_edition_likes"
  for select
  to "anon", "authenticated"
  using (exists (
    select 1
    from "public"."digest_editions" as "edition"
    where "edition"."id" = "digest_edition_likes"."edition_id"
      and "edition"."status" = 'published'
  ));

revoke all privileges on table "public"."digest_edition_likes" from "anon", "authenticated";
grant all privileges on table "public"."digest_edition_likes" to "service_role";
grant select on table "public"."digest_edition_likes" to "anon", "authenticated";
