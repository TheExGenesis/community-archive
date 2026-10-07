-- Reader likes and comments on strands. Strands live in the community app
-- data snapshot rather than a table, so rows key on the seed tweet id. Whether
-- a strand is visible (author membership, opted-out participants) is decided
-- in application code, so both tables are service-role only: the API checks
-- the strand is visible and verifies the session before reading or writing.
create table if not exists "public"."strand_likes" (
    "id" uuid primary key default gen_random_uuid(),
    "strand_id" text not null,
    "user_id" uuid not null references "auth"."users"("id") on delete cascade,
    "created_at" timestamptz not null default now(),
    constraint "strand_likes_strand_user_key" unique ("strand_id", "user_id"),
    constraint "strand_likes_strand_id_check" check ("strand_id" ~ '^[0-9]{1,20}$')
);
alter table "public"."strand_likes" owner to "postgres";

-- The display identity is captured at write time so rendering never joins
-- auth.users. Deletes are soft so a thread keeps its shape.
create table if not exists "public"."strand_comments" (
    "id" uuid primary key default gen_random_uuid(),
    "strand_id" text not null,
    "user_id" uuid not null references "auth"."users"("id") on delete cascade,
    "content" text not null,
    "username" text,
    "display_name" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz,
    constraint "strand_comments_strand_id_check" check ("strand_id" ~ '^[0-9]{1,20}$'),
    constraint "strand_comments_content_length_check"
      check (char_length("content") between 1 and 2000)
);
alter table "public"."strand_comments" owner to "postgres";

create index if not exists "strand_likes_strand_idx"
  on "public"."strand_likes" ("strand_id");

create index if not exists "strand_comments_strand_created_idx"
  on "public"."strand_comments" ("strand_id", "created_at");

-- No policies: service-role only.
alter table "public"."strand_likes" enable row level security;
alter table "public"."strand_comments" enable row level security;

revoke all privileges on table "public"."strand_likes" from "anon", "authenticated";
grant all privileges on table "public"."strand_likes" to "service_role";

revoke all privileges on table "public"."strand_comments" from "anon", "authenticated";
grant all privileges on table "public"."strand_comments" to "service_role";
