--RTs apparently have no expanded_url

ALTER TABLE public.tweet_urls
ALTER COLUMN expanded_url DROP NOT NULL;