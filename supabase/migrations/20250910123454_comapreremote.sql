create or replace view "public"."quote_tweets" as  SELECT t.tweet_id,
    "substring"(tu.expanded_url, 'status/([0-9]+)'::text) AS quoted_tweet_id,
    "substring"(tu.expanded_url, 'https?://(?:www\\.)?twitter\\.com/([^/]+)/status/'::text) AS quoted_tweet_username
   FROM (tweet_urls tu
     JOIN tweets t ON ((tu.tweet_id = t.tweet_id)))
  WHERE ((tu.expanded_url ~~ 'https://twitter.com/%/status/%'::text) OR (tu.expanded_url ~~ 'https://x.com/%/status/%'::text));



