-- Likes made on Community Archive itself, distinct from the archived X likes
-- in "likes"/"liked_tweets". One row is one public record shaped for a later
-- atproto port: "id" is the record key, "account_id" the actor, "tweet_id" the
-- subject, "created_at" the record time. The subject is not a foreign key
-- because tweets may live only in the ClickHouse projection.
create table if not exists "public"."ca_tweet_likes" (
    "id" uuid primary key default gen_random_uuid(),
    "user_id" uuid not null references "auth"."users"("id") on delete cascade,
    "account_id" text not null,
    "tweet_id" text not null,
    "username" text,
    "display_name" text,
    "created_at" timestamptz not null default now(),
    constraint "ca_tweet_likes_user_tweet_key" unique ("user_id", "tweet_id"),
    constraint "ca_tweet_likes_account_id_check" check ("account_id" ~ '^[0-9]{1,20}$'),
    constraint "ca_tweet_likes_tweet_id_check" check ("tweet_id" ~ '^[0-9]{1,20}$')
);
alter table "public"."ca_tweet_likes" owner to "postgres";

create index if not exists "ca_tweet_likes_tweet_created_idx"
  on "public"."ca_tweet_likes" ("tweet_id", "created_at" desc);

-- Rows carry auth user ids, so the table is service-role only. The API
-- verifies the session before writing and serves the public fields.
alter table "public"."ca_tweet_likes" enable row level security;
revoke all privileges on table "public"."ca_tweet_likes" from "anon", "authenticated";
grant all privileges on table "public"."ca_tweet_likes" to "service_role";

-- Like count per tweet, plus whether the given viewer liked it.
create function public.ca_tweet_like_summary(p_tweet_ids text[], p_viewer_id uuid)
returns table (tweet_id text, like_count bigint, viewer_liked boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    likes.tweet_id,
    count(*) as like_count,
    coalesce(bool_or(likes.user_id = p_viewer_id), false) as viewer_liked
  from public.ca_tweet_likes as likes
  where likes.tweet_id = any(p_tweet_ids)
  group by likes.tweet_id;
$$;
revoke all on function public.ca_tweet_like_summary(text[], uuid) from public, anon, authenticated;
grant execute on function public.ca_tweet_like_summary(text[], uuid) to service_role;
