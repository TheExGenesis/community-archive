-- Generated editorial titles and summaries for archive permalink pages. One
-- row per connected sequence (a single tweet or a thread), shared by every
-- permalink inside it. Ineligible outcomes are stored too, so a low-content
-- post is judged once. Writes come only from the server's service-role client.
create table if not exists "public"."tweet_page_summaries" (
    "subject_key" text primary key,
    "kind" text not null check ("kind" in ('tweet', 'thread')),
    "tweet_ids" text[] not null check (cardinality("tweet_ids") > 0),
    "eligible" boolean not null,
    "title" text,
    "description" text,
    "ineligible_reason" text,
    "model" text not null,
    "prompt_version" integer not null,
    "generated_at" timestamptz not null default now(),
    "search_vector" tsvector generated always as (
        to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))
    ) stored,
    constraint "tweet_page_summaries_eligible_has_copy" check (
        not "eligible" or ("title" is not null and "description" is not null)
    )
);
alter table "public"."tweet_page_summaries" owner to "postgres";

-- Find the summary covering any tweet, and search summaries by topic.
create index if not exists "tweet_page_summaries_tweet_ids_idx"
  on "public"."tweet_page_summaries" using gin ("tweet_ids");
create index if not exists "tweet_page_summaries_search_idx"
  on "public"."tweet_page_summaries" using gin ("search_vector");

alter table "public"."tweet_page_summaries" enable row level security;

-- Generated summaries are public archive metadata. Writes stay service-role only.
create policy "Tweet page summaries are publicly readable"
  on "public"."tweet_page_summaries"
  for select
  to "anon", "authenticated"
  using (true);

revoke all privileges on table "public"."tweet_page_summaries" from "anon", "authenticated";
grant all privileges on table "public"."tweet_page_summaries" to "service_role";
grant select on table "public"."tweet_page_summaries" to "anon", "authenticated";
