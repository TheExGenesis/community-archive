-- Allow NULL for retweet_count on public.tweets.
-- These values may be absent for tweets ingested from the live API
-- rather than from a user's Twitter archive export.
--
-- Allow NULL for width/height on public.tweet_media.
-- Media dimensions are not always available (e.g. for videos or
-- externally-sourced media).

ALTER TABLE "public"."tweets"
  ALTER COLUMN "retweet_count" DROP NOT NULL;

ALTER TABLE "public"."tweet_media"
  ALTER COLUMN "width" DROP NOT NULL;

ALTER TABLE "public"."tweet_media"
  ALTER COLUMN "height" DROP NOT NULL;
